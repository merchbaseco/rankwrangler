import { describe, expect, it, mock } from 'bun:test';
import type { PgBoss } from 'pg-boss';
import { startGatedWorker } from './gated-worker';

const job = { id: 'job-1', data: { targetId: 't1' }, singletonKey: 't1', priority: 1 };
const fakeBoss = (jobs: (typeof job)[]) => {
    const calls = { fetch: 0, complete: [] as string[], fail: [] as string[], send: [] as unknown[] };
    const boss = {
        fetch: mock(async () => {
            calls.fetch++;
            const next = jobs.shift();
            return next ? [next] : [];
        }),
        complete: mock(async (_name: string, id: string) => {
            calls.complete.push(id);
        }),
        fail: mock(async (_name: string, id: string) => {
            calls.fail.push(id);
        }),
        send: mock(async (...args: unknown[]) => {
            calls.send.push(args);
            return 'job-2';
        }),
    };
    return { boss: boss as unknown as PgBoss, calls };
};
const until = async (check: () => boolean) => {
    for (let i = 0; i < 200 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 5));
    expect(check()).toBe(true);
};

describe('provider-gated worker', () => {
    it('does not fetch while the pipeline is paused or the provider is cooling down', async () => {
        const { boss, calls } = fakeBoss([job]);
        for (const readyAt of [null, new Date(Date.now() + 60_000)]) {
            const worker = startGatedWorker({
                boss,
                name: 'scan-keyword',
                gate: async () => readyAt,
                run: async () => ({}),
            });
            await new Promise(resolve => setTimeout(resolve, 20));
            await worker.stop();
        }
        expect(calls.fetch).toBe(0);
    });
    it('completes a run and then re-sends its followup for the same entity', async () => {
        const { boss, calls } = fakeBoss([job]);
        const at = new Date(Date.now() + 5000);
        const worker = startGatedWorker({
            boss,
            name: 'scan-keyword',
            gate: async () => new Date(0),
            run: async () => ({ didWork: true, followup: { at, priority: 0 } }),
        });
        await until(() => calls.send.length === 1);
        await worker.stop();
        expect(calls.complete).toEqual(['job-1']);
        expect(calls.send[0]).toEqual([
            'scan-keyword',
            { targetId: 't1' },
            { singletonKey: 't1', priority: 0, startAfter: at },
        ]);
    });
    it('fails a throwing run without a followup and keeps working', async () => {
        const { boss, calls } = fakeBoss([job, { ...job, id: 'job-2' }]);
        let runs = 0;
        const worker = startGatedWorker({
            boss,
            name: 'scan-keyword',
            gate: async () => new Date(0),
            run: async () => {
                if (++runs === 1) throw new Error('provider unavailable');
                return { didWork: true };
            },
            failureBackoffMs: 1,
        });
        await until(() => calls.complete.length === 1);
        await worker.stop();
        expect(calls.fail).toEqual(['job-1']);
        expect(calls.complete).toEqual(['job-2']);
        expect(calls.send).toHaveLength(0);
    });
});
