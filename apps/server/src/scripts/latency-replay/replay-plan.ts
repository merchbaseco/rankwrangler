import { readFileSync } from 'node:fs';
import { z } from 'zod';

// One row of Factory's `calls.jsonl` (the RankWrangler latency handoff dataset).
const recordedCall = z.object({
    stack: z.string(),
    session: z.string(),
    agent: z.string(),
    tool: z.string(),
    operation: z.string(),
    input: z.string(),
    start: z.string(),
    end: z.string(),
    duration_s: z.number(),
    error: z.string(),
});

export interface ReplayCall {
    readonly tool: string;
    readonly operation: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly offsetMs: number;
    readonly recordedMs: number;
}

export interface ReplayBurst {
    readonly id: string;
    readonly stack: string;
    readonly calls: readonly ReplayCall[];
    readonly recordedWallMs: number;
}

// Calls one agent launches within this window of the burst's first call count as one burst.
const BURST_WINDOW_MS = 3000;
// Factory never reached RankWrangler for these, so they are not RankWrangler work.
const FACTORY_CONNECTION_FAILURE = 'The MCP call failed. Check the connection in Settings.';

export const loadReplayPlan = ({
    path,
    asins,
    termPrefix,
}: {
    path: string;
    asins: readonly string[];
    termPrefix: string;
}): ReplayBurst[] => {
    const rows = readFileSync(path, 'utf8')
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => recordedCall.parse(JSON.parse(line)))
        .filter(row => row.error !== FACTORY_CONNECTION_FAILURE)
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

    const byAgent = new Map<string, typeof rows>();
    for (const row of rows) {
        const key = `${row.session}/${row.agent}`;
        byAgent.set(key, [...(byAgent.get(key) ?? []), row]);
    }

    const bursts: ReplayBurst[] = [];
    for (const [agentKey, agentRows] of byAgent) {
        let current: typeof rows = [];
        const flush = () => {
            if (current.length === 0) return;
            const first = Date.parse(current[0].start);
            bursts.push({
                id: `${agentKey}@${current[0].start}`,
                stack: current[0].stack,
                recordedWallMs: Math.max(...current.map(row => Date.parse(row.end))) - first,
                calls: current.map(row => ({
                    tool: row.tool,
                    operation: row.operation,
                    input: rewriteInput(JSON.parse(row.input), asins, termPrefix),
                    offsetMs: Date.parse(row.start) - first,
                    recordedMs: row.duration_s * 1000,
                })),
            });
            current = [];
        };
        for (const row of agentRows) {
            if (current.length > 0 && Date.parse(row.start) - Date.parse(current[0].start) > BURST_WINDOW_MS) {
                flush();
            }
            current.push(row);
        }
        flush();
    }
    return bursts.sort((a, b) => a.id.localeCompare(b.id));
};

// Recorded ASINs become seeded local ones (stable per ASIN), and keyword-results terms gain a
// per-run prefix so each run starts cold while repeats within a run still reuse evidence.
const rewriteInput = (
    input: Record<string, unknown>,
    asins: readonly string[],
    termPrefix: string
): Record<string, unknown> => {
    const localAsin = (asin: unknown) =>
        typeof asin === 'string' ? asins[hash(asin) % asins.length] : asin;
    const next = { ...input };
    if ('asin' in next) next.asin = localAsin(next.asin);
    if (Array.isArray(next.products)) {
        next.products = next.products.map(product =>
            product && typeof product === 'object'
                ? { ...product, asin: localAsin((product as { asin?: unknown }).asin) }
                : product
        );
    }
    if (next.operation === 'results' && typeof next.term === 'string') {
        next.term = `${termPrefix} ${next.term}`;
    }
    return next;
};

const hash = (value: string) => {
    let result = 0;
    for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
    return result;
};
