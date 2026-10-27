import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
    buildKeywordJudgmentRequest,
    parseKeywordJudgments,
} from '../../services/keyword-judgment-contract';

const configurationSchema = z.object({
    cases: z
        .array(
            z.object({
                id: z.string(),
                term: z.string(),
                expected: z.boolean().optional(),
                source: z.string(),
            })
        )
        .min(1)
        .max(10000),
    rounds: z.number().int().min(1).max(5).default(5),
    sizes: z.array(z.number().int().min(1).max(100)).default([5, 25, 50, 100]),
});
const usageSchema = z.object({
    model: z.string(),
    usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});
const configuration = configurationSchema.parse(
    JSON.parse(process.env.RW_EVAL_DATASET_INLINE ?? readFileSync(process.argv[2] ?? '', 'utf8'))
);
const key = process.env.RANKWRANGLER_TYPESAFE_API_KEY;
if (!key || key === 'typesafe-test-key')
    throw new Error('A runtime TypeSafe credential is required');
let nextStartAt = 0;
let requests = 0;
// Evaluates the production contract. The shared-array and shared-policy variants compared in
// October lost to explicit per-question phrases and were folded into the contract itself.
const configurations = configuration.sizes.map(size => ({ size, variant: 'current' as const }));
console.log(
    JSON.stringify({
        kind: 'start',
        at: new Date().toISOString(),
        cases: configuration.cases.length,
        rounds: configuration.rounds,
        configurations,
    })
);
for (let round = 0; round < configuration.rounds; round++) {
    const order = [
        ...configurations.slice(round % configurations.length),
        ...configurations.slice(0, round % configurations.length),
    ];
    for (const configurationRun of order) {
        const started = performance.now();
        const requestTimes: number[] = [];
        const decisions: { id: string; probability: number; accepted: boolean }[] = [];
        let inputTokens = 0;
        let outputTokens = 0;
        for (let offset = 0; offset < configuration.cases.length; offset += configurationRun.size) {
            const rows = configuration.cases.slice(offset, offset + configurationRun.size);
            const body = buildKeywordJudgmentRequest(rows);
            await delay(Math.max(0, nextStartAt - Date.now()));
            nextStartAt = Date.now() + 2000;
            const callStart = performance.now();
            const response = await fetch('https://api.typesafe.ai/v1/systemone', {
                method: 'POST',
                headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30000),
            });
            requests += 1;
            if (!response.ok) {
                console.log(
                    JSON.stringify({
                        kind: 'failure',
                        round,
                        size: configurationRun.size,
                        variant: configurationRun.variant,
                        status: response.status,
                        requests,
                        retryAfter: response.headers.get('retry-after'),
                    })
                );
                throw new Error(
                    `Jev returned HTTP ${response.status}; stopping instead of hiding failed calls`
                );
            }
            const payload: unknown = await response.json();
            const parsed = parseKeywordJudgments(rows, payload);
            const metadata = usageSchema.parse(payload);
            if (metadata.model !== 'jev-1.13.0')
                throw new Error('Eval model differs from production');
            requestTimes.push(performance.now() - callStart);
            inputTokens += metadata.usage.input_tokens;
            outputTokens += metadata.usage.output_tokens;
            decisions.push(...parsed.map(row => ({ ...row, accepted: row.probability >= 0.8 })));
        }
        const gold = configuration.cases.filter(row => row.expected !== undefined);
        console.log(
            JSON.stringify({
                kind: 'result',
                round,
                ...configurationRun,
                requests: requestTimes.length,
                inputTokens,
                outputTokens,
                httpMs: requestTimes.reduce((a, b) => a + b, 0),
                pacedWallMs: performance.now() - started,
                requestTimes,
                goldCorrect: gold.filter(
                    row => decisions.find(answer => answer.id === row.id)?.accepted === row.expected
                ).length,
                goldCount: gold.length,
                decisions,
            })
        );
    }
}
console.log(JSON.stringify({ kind: 'complete', requests, at: new Date().toISOString() }));
