import { writeFileSync } from 'node:fs';
import http from 'node:http';
import { Readable } from 'node:stream';
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadReplayPlan, type ReplayBurst, type ReplayCall } from './replay-plan';

// Replays Factory's recorded RankWrangler MCP bursts against a local server and reports per-call and
// per-burst wall time. `--client factory` reproduces Factory's MCP runner (a fresh client per call,
// one call at a time per connection and factory); `--client parallel` lets a burst run together.
const { values } = parseArgs({
    options: {
        server: { type: 'string', default: 'http://127.0.0.1:37172' },
        dataset: { type: 'string' },
        asins: { type: 'string' },
        client: { type: 'string', default: 'factory' },
        lanes: { type: 'string', default: '1' },
        only: { type: 'string' },
        limit: { type: 'string' },
        'term-prefix': { type: 'string' },
        out: { type: 'string' },
    },
});

interface CallResult {
    burst: string;
    operation: string;
    offsetMs: number;
    durationMs: number;
    recordedMs: number;
    outcome: string;
}

const main = async () => {
    const server = new URL(values.server ?? '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(server.hostname)) {
        throw new Error(`latency-replay only targets a loopback server, not ${server.hostname}.`);
    }
    if (!values.dataset) throw new Error('--dataset names calls.jsonl.');
    const asins = (values.asins ?? '').split(',').filter(Boolean);
    if (asins.length === 0) throw new Error('--asins lists seeded local ASINs.');
    const mode = values.client === 'parallel' ? 'parallel' : 'factory';

    const termPrefix = values['term-prefix'] ?? `rwr${Date.now().toString(36)}`;
    const bursts = loadReplayPlan({ path: values.dataset, asins, termPrefix }).filter(burst =>
        values.only ? burst.calls.some(call => call.operation === values.only) : true
    ).slice(0, values.limit ? Number(values.limit) : undefined);
    console.log(`Replaying ${bursts.length} bursts (${mode} client, ${values.lanes} lanes)`);

    const exclusive = createExclusive();
    const results: CallResult[] = [];
    const burstWalls = new Map<string, number>();
    const queue = [...bursts];
    const lane = async () => {
        for (let burst = queue.shift(); burst; burst = queue.shift()) {
            const started = Date.now();
            const calls = await replayBurst(burst, call =>
                mode === 'factory'
                    ? exclusive(burst.stack, () => callTool(server, call))
                    : callTool(server, call)
            );
            burstWalls.set(burst.id, Date.now() - started);
            results.push(...calls);
            process.stdout.write('.');
        }
    };
    await Promise.all(Array.from({ length: Number(values.lanes) }, lane));
    console.log();

    const report = summarize(bursts, results, burstWalls);
    console.log(report.text);
    if (values.out) {
        writeFileSync(values.out, JSON.stringify({ mode, termPrefix, ...report.data }, null, 2));
    }
};

const replayBurst = async (
    burst: ReplayBurst,
    run: (call: ReplayCall) => Promise<{ outcome: string }>
): Promise<CallResult[]> => {
    const started = Date.now();
    return await Promise.all(
        burst.calls.map(async call => {
            await sleep(Math.max(0, call.offsetMs - (Date.now() - started)));
            const callStarted = Date.now();
            const { outcome } = await run(call);
            return {
                burst: burst.id,
                operation: `${call.tool.replace('rankwrangler_', '')} ${call.operation}`,
                offsetMs: call.offsetMs,
                durationMs: Date.now() - callStarted,
                recordedMs: call.recordedMs,
                outcome,
            };
        })
    );
};

// Factory's runner: connect, initialize, call, close for every call.
const callTool = async (server: URL, call: ReplayCall) => {
    const client = new Client({ name: 'Factory', version: '0.3.0' });
    const transport = new StreamableHTTPClientTransport(new URL('/mcp', server), {
        fetch: hostedFetch,
        requestInit: { headers: { 'cf-access-jwt-assertion': 'latency-replay' } },
    });
    try {
        await client.connect(transport);
        const result = await client.callTool({ name: call.tool, arguments: call.input }, undefined, {
            timeout: 10 * 60 * 1000,
        });
        const text = JSON.stringify(result.structuredContent ?? result.content).slice(0, 200);
        const code = /"code":"([A-Z_]+)"/.exec(text)?.[1];
        return { outcome: result.isError ? (code ?? 'error') : 'ok' };
    } catch (error) {
        return { outcome: `failed: ${error instanceof Error ? error.message.slice(0, 80) : error}` };
    } finally {
        await client.close().catch(() => undefined);
    }
};

// The MCP route admits only its hosted names, and fetch will not send a Host header, so requests
// to the loopback server go through node:http with the hosted name.
const hostedFetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = typeof init?.body === 'string' ? init.body : undefined;
    return await new Promise((resolve, reject) => {
        const request = http.request(
            url,
            {
                method: init?.method ?? 'GET',
                headers: { ...headers, host: 'rankwrangler.merchbase.co' },
                signal: init?.signal ?? undefined,
            },
            response => {
                const responseHeaders = new Headers();
                for (const [name, value] of Object.entries(response.headers)) {
                    if (typeof value === 'string') responseHeaders.set(name, value);
                }
                const status = response.statusCode ?? 500;
                const noBody = status === 202 || status === 204;
                resolve(
                    new Response(noBody ? null : (Readable.toWeb(response) as ReadableStream), {
                        status,
                        headers: responseHeaders,
                    })
                );
            }
        );
        request.on('error', reject);
        request.end(body);
    });
};

const createExclusive = () => {
    const chains = new Map<string, Promise<unknown>>();
    return async <T>(name: string, work: () => Promise<T>): Promise<T> => {
        const next = (chains.get(name) ?? Promise.resolve()).catch(() => undefined).then(work);
        chains.set(name, next);
        try {
            return await next;
        } finally {
            if (chains.get(name) === next) chains.delete(name);
        }
    };
};

const summarize = (
    bursts: readonly ReplayBurst[],
    results: readonly CallResult[],
    burstWalls: ReadonlyMap<string, number>
) => {
    const byOperation = new Map<string, CallResult[]>();
    for (const result of results) {
        byOperation.set(result.operation, [...(byOperation.get(result.operation) ?? []), result]);
    }
    const lines = ['operation             n   median    p90     total   recorded total'];
    for (const [operation, rows] of [...byOperation].sort((a, b) => b[1].length - a[1].length)) {
        const durations = rows.map(row => row.durationMs);
        lines.push(
            `${operation.padEnd(20)}${String(rows.length).padStart(3)}${seconds(quantile(durations, 0.5))}${seconds(quantile(durations, 0.9))}${seconds(sum(durations), 10)}${seconds(sum(rows.map(row => row.recordedMs)), 12)}`
        );
    }
    const walls = bursts.map(burst => burstWalls.get(burst.id) ?? 0);
    const recorded = bursts.map(burst => burst.recordedWallMs);
    lines.push(
        `bursts ${bursts.length}: wall total ${seconds(sum(walls))}s median ${seconds(quantile(walls, 0.5))}s p90 ${seconds(quantile(walls, 0.9))}s | recorded total ${seconds(sum(recorded))}s`
    );
    const outcomes = new Map<string, number>();
    for (const result of results) outcomes.set(result.outcome, (outcomes.get(result.outcome) ?? 0) + 1);
    lines.push(`outcomes ${JSON.stringify(Object.fromEntries(outcomes))}`);
    return {
        text: lines.join('\n'),
        data: {
            burstWallTotalMs: sum(walls),
            recordedBurstWallTotalMs: sum(recorded),
            bursts: bursts.map(burst => ({ id: burst.id, wallMs: burstWalls.get(burst.id) ?? 0, recordedWallMs: burst.recordedWallMs })),
            calls: results,
        },
    };
};

const quantile = (values: readonly number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
};
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const seconds = (ms: number, width = 8) => (ms / 1000).toFixed(1).padStart(width);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

main().catch(error => {
    console.error(error);
    process.exit(1);
});
