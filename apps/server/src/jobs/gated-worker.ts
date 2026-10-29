import type { Job, PgBoss } from 'pg-boss';
import type { ProviderGate } from '@/db/provider-gates';

// What a gated job may ask for when it finishes: the same job again (same entity and data), at a
// time and priority. It is re-sent only after this run completes, because entity queues allow one
// queued-or-running job per entity.
export type GatedJobFollowup = { at: Date; priority?: number };

// Fetches one job at a time, and only once the provider gate says it can start. Jobs therefore wait
// in the queue, visible and ordered by priority, instead of starting and deferring themselves.
export const startGatedWorker = (input: {
    boss: PgBoss;
    name: string;
    gate: ProviderGate;
    run: (job: Job<unknown>) => Promise<unknown>;
    failureBackoffMs?: number;
    // Parallel fetch loops. The provider's own reservation still enforces its rate; extra loops
    // only hide per-job latency (an SP-API page takes about a second end to end).
    concurrency?: number;
    // How long the loops leave between job starts. Without it, every loop sees the provider
    // ready at the same moment, races for one reservation, and all but one re-queue.
    startSpacingMs?: () => Promise<number>;
}) => {
    let nextStartAt = 0;
    let spacingMs = 0;
    let stopped = false;
    const sleepers = new Set<() => void>();
    const sleep = (ms: number) =>
        new Promise<void>(resolve => {
            if (stopped) return resolve();
            const wake = () => {
                clearTimeout(timer);
                sleepers.delete(wake);
                resolve();
            };
            const timer = setTimeout(wake, ms);
            sleepers.add(wake);
        });
    const loop = async () => {
        while (!stopped) {
            try {
                const readyAt = await input.gate();
                if (!readyAt) {
                    await sleep(pausedPollMs);
                    continue;
                }
                const wait = Math.max(readyAt.getTime(), nextStartAt) - Date.now();
                if (wait > 0) {
                    await sleep(Math.min(wait, maxGateWaitMs));
                    continue;
                }
                // Claim this start slot synchronously (before any await) so sibling loops wait for
                // the next one, then refresh the spacing for later starts.
                nextStartAt = Date.now() + spacingMs;
                if (input.startSpacingMs) spacingMs = await input.startSpacingMs();
                const [job] = await input.boss.fetch(input.name, {
                    batchSize: 1,
                    priority: true,
                    includeMetadata: true,
                });
                if (!job) {
                    await sleep(emptyPollMs);
                    continue;
                }
                let result: unknown;
                try {
                    result = await input.run(job);
                } catch (error) {
                    await input.boss.fail(input.name, job.id, { message: errorMessage(error) });
                    // A failing provider or database would otherwise fail the whole queue at once.
                    await sleep(input.failureBackoffMs ?? errorBackoffMs);
                    continue;
                }
                await input.boss.complete(input.name, job.id);
                const followup = followupOf(result);
                if (followup)
                    await input.boss.send(input.name, job.data as object, {
                        singletonKey: job.singletonKey ?? undefined,
                        priority: followup.priority ?? job.priority,
                        startAfter: followup.at,
                    });
            } catch (error) {
                console.error(`[Jobs] ${input.name} gated worker failed; retrying`, error);
                await sleep(errorBackoffMs);
            }
        }
    };
    const running = (async () => {
        if (input.startSpacingMs) spacingMs = await input.startSpacingMs().catch(() => 0);
        await Promise.all(Array.from({ length: input.concurrency ?? 1 }, loop));
    })();
    return {
        stop: async () => {
            stopped = true;
            for (const wake of [...sleepers]) wake();
            await running;
        },
    };
};

const pausedPollMs = 10_000;
const maxGateWaitMs = 10_000;
const emptyPollMs = 3000;
const errorBackoffMs = 5000;

const followupOf = (result: unknown): GatedJobFollowup | null => {
    if (!result || typeof result !== 'object' || !('followup' in result)) return null;
    const followup = (result as { followup?: GatedJobFollowup | null }).followup;
    return followup?.at instanceof Date ? followup : null;
};
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
