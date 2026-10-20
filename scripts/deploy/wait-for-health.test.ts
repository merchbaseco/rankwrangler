import { describe, expect, it } from 'bun:test';
import { revisionIsLive, waitForHealth } from './wait-for-health.mjs';

const revision = 'a'.repeat(40);

describe('waitForHealth', () => {
    it('resolves when every URL reports status ok and the deployed revision', async () => {
        const seen: string[] = [];
        await waitForHealth({
            urls: ['https://example.test/api/health', 'https://example.test/health/live'],
            revision,
            timeoutMs: 0,
            intervalMs: 1,
            now: () => 0,
            fetchImpl: async (url: string) => {
                seen.push(url);
                return jsonResponse(200, { status: 'ok', revision });
            },
        });

        expect(seen).toEqual([
            'https://example.test/api/health',
            'https://example.test/health/live',
        ]);
        expect(revisionIsLive({ status: 'ok', revision }, revision)).toBe(true);
    });

    it('keeps polling a degraded body and fails when the timeout elapses', async () => {
        let clock = 0;
        await expect(
            waitForHealth({
                urls: ['https://example.test/api/health'],
                revision,
                timeoutMs: 10,
                intervalMs: 5,
                now: () => clock,
                sleepImpl: async (ms: number) => {
                    clock += ms;
                },
                fetchImpl: async () =>
                    jsonResponse(503, {
                        status: 'degraded',
                        failing: ['keepa-history'],
                        revision,
                    }),
            }),
        ).rejects.toThrow(`Health did not converge on ${revision} within 10ms.`);
        expect(clock).toBe(10);
    });

    it('rejects a 200 whose revision is not the deployed SHA', async () => {
        await expect(
            waitForHealth({
                urls: ['https://example.test/health/live'],
                revision,
                timeoutMs: 0,
                intervalMs: 1,
                now: () => 0,
                fetchImpl: async () => jsonResponse(200, { status: 'ok', revision: 'dev' }),
            }),
        ).rejects.toThrow('"revision":"dev"');
    });
});

const jsonResponse = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
});
