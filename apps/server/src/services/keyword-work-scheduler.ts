import type { JobInsert } from 'pg-boss';
import { isAutomaticSyncPaused } from '@/db/automatic-sync';
import { readScanBacklog } from '@/db/keyword-scan-backlog';
import { listDueAutocomplete, listDueKeywordScans } from '@/db/keyword-work-due';
import { promoteWaitingJobs } from '@/db/job-queue-status';
import { keywordQueues, scanPriority } from '@/jobs/keyword-job-queues';

type QueueName = (typeof keywordQueues)[keyof typeof keywordQueues];
type Deps = {
    isPaused: () => Promise<boolean>;
    backlog: typeof readScanBacklog;
    dueScans: typeof listDueKeywordScans;
    dueAutocomplete: typeof listDueAutocomplete;
    promote: typeof promoteWaitingJobs;
    queued: (name: QueueName) => Promise<number>;
    insert: (name: QueueName, jobs: JobInsert[]) => Promise<number>;
};
type QueueAccess = Pick<Deps, 'queued' | 'insert'>;

// Enqueues due keyword scans and autocomplete while sync runs; it calls no provider. Jobs already
// queued for an entity are skipped by the queue, so enqueueing everything due each minute is safe.
// Brand Analytics keywords are listed by their own jobs and simply become due here; autocomplete
// seeds are added only while the scan backlog allows.
export const scheduleKeywordWork = async (queues: QueueAccess, overrides: Partial<Deps> = {}) => {
    const deps: Deps = { ...defaults, ...queues, ...overrides };
    if (await deps.isPaused()) return { didWork: false, paused: true };
    const now = new Date();
    const backlog = await deps.backlog(now);
    const scans = await deps.dueScans(now, scanBatch);
    const enqueued = {
        scanHeads: await deps.insert(keywordQueues.scan, scanJobs(scans, false)),
        scanDepth: await deps.insert(keywordQueues.scan, scanJobs(scans, true)),
        autocomplete: 0,
        // Depth waiting six hours joins the heads, well before its SP-API cursor expires at a day.
        depthPromoted: await deps.promote(keywordQueues.scan, {
            from: scanPriority.depth,
            to: scanPriority.head,
            waitingSince: new Date(now.getTime() - depthAgingMs),
        }),
    };
    if (backlog.producersOpen) {
        const seedRoom = autocompleteDepth - (await deps.queued(keywordQueues.autocomplete));
        if (seedRoom > 0)
            enqueued.autocomplete = await deps.insert(
                keywordQueues.autocomplete,
                (await deps.dueAutocomplete(now, seedRoom)).map(row => ({
                    data: { queryId: row.id },
                    singletonKey: row.id,
                }))
            );
    }
    return {
        didWork: Object.values(enqueued).some(count => count > 0),
        paused: false,
        backlog,
        enqueued,
    };
};

// About five minutes of autocomplete starts at its ten-second spacing.
const autocompleteDepth = 30;
const depthAgingMs = 6 * 60 * 60 * 1000;
const scanBatch = 1000;
const defaults: Omit<Deps, keyof QueueAccess> = {
    isPaused: () => isAutomaticSyncPaused(),
    backlog: readScanBacklog,
    dueScans: listDueKeywordScans,
    dueAutocomplete: listDueAutocomplete,
    promote: promoteWaitingJobs,
};
const scanJobs = (
    rows: readonly { id: string; depth: boolean; tracked: boolean }[],
    depth: boolean
) =>
    rows
        .filter(row => row.depth === depth)
        .map(row => ({
            data: { targetId: row.id },
            singletonKey: row.id,
            priority: depth
                ? scanPriority.depth
                : row.tracked
                  ? scanPriority.recheck
                  : scanPriority.head,
        }));
