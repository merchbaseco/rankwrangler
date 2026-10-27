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
}) => {
    let stopped = false;
    let wake: (() => void) | null = null;
    const sleep = (ms: number) =>
        new Promise<void>(resolve => {
            if (stopped) return resolve();
            const timer = setTimeout(resolve, ms);
            wake = () => {
                clearTimeout(timer);
                resolve();
            };
        });
    const loop = async () => {
        while (!stopped) {
            try {
                const readyAt = await input.gate();
                if (!readyAt) {
                    await sleep(pausedPollMs);
                    continue;
                }
                const wait = readyAt.getTime() - Date.now();
                if (wait > 0) {
                    await sleep(Math.min(wait, maxGateWaitMs));
                    continue;
                }
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
    const running = loop();
    return {
        stop: async () => {
            stopped = true;
            wake?.();
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
