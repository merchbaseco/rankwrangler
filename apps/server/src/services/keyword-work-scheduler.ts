import type { JobInsert } from 'pg-boss';
import { isAutomaticSyncPaused } from '@/db/automatic-sync';
import { backfillKeywordPrefixes } from '@/db/keyword-prefixes';
import {
    listDueAutocomplete,
    listDueKeywordScans,
    listDuePrefixAutocomplete,
} from '@/db/keyword-work-due';
import { promoteWaitingJobs } from '@/db/job-queue-status';
import { keywordQueues, scanPriority } from '@/jobs/keyword-job-queues';

type QueueName = (typeof keywordQueues)[keyof typeof keywordQueues];
type Deps = {
    isPaused: () => Promise<boolean>;
    dueScans: typeof listDueKeywordScans;
    dueAutocomplete: typeof listDueAutocomplete;
    duePrefixes: typeof listDuePrefixAutocomplete;
    backfillPrefixes: typeof backfillKeywordPrefixes;
    promote: typeof promoteWaitingJobs;
    queued: (name: QueueName) => Promise<number>;
    insert: (name: QueueName, jobs: JobInsert[]) => Promise<number>;
};
type QueueAccess = Pick<Deps, 'queued' | 'insert'>;

// Enqueues due keyword scans and autocomplete while sync runs; it calls no provider. Jobs already
// queued for an entity are skipped by the queue, so enqueueing everything due each minute is safe.
// Brand Analytics keywords are listed by their own jobs and simply become due here. Autocomplete
// seeds and prefixes are not held back by scan load: the scan queue may grow, and autocomplete
// keeps its own pacing and daily ceiling. They are only topped up to a short queue so the
// autocomplete queue never floods. The keyword prefix backfill is database-only and runs even while
// paused.
export const scheduleKeywordWork = async (queues: QueueAccess, overrides: Partial<Deps> = {}) => {
    const deps: Deps = { ...defaults, ...queues, ...overrides };
    const prefixes = await deps.backfillPrefixes(prefixBackfillBatch);
    if (await deps.isPaused())
        return {
            didWork: prefixes.registered > 0,
            paused: true,
            prefixesRegistered: prefixes.registered,
        };
    const now = new Date();
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
    const seedRoom = autocompleteDepth - (await deps.queued(keywordQueues.autocomplete));
    if (seedRoom > 0)
        enqueued.autocomplete = await deps.insert(
            keywordQueues.autocomplete,
            interleave<JobInsert>(
                (await deps.dueAutocomplete(now, seedRoom)).map(row => ({
                    data: { queryId: row.id },
                    singletonKey: row.id,
                })),
                (await deps.duePrefixes(now, seedRoom)).map(row => ({
                    data: { prefixId: row.id },
                    singletonKey: `prefix:${row.id}`,
                }))
            ).slice(0, seedRoom)
        );
    return {
        didWork: prefixes.registered > 0 || Object.values(enqueued).some(count => count > 0),
        paused: false,
        prefixesRegistered: prefixes.registered,
        enqueued,
    };
};

// About five minutes of autocomplete starts at its ten-second spacing.
const autocompleteDepth = 30;
const depthAgingMs = 6 * 60 * 60 * 1000;
const prefixBackfillBatch = 2000;
const scanBatch = 1000;
const defaults: Omit<Deps, keyof QueueAccess> = {
    isPaused: () => isAutomaticSyncPaused(),
    dueScans: listDueKeywordScans,
    dueAutocomplete: listDueAutocomplete,
    duePrefixes: listDuePrefixAutocomplete,
    backfillPrefixes: backfillKeywordPrefixes,
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

// Alternates tracked-keyword seeds and prefixes so neither starves the other of autocomplete calls.
const interleave = <T>(a: readonly T[], b: readonly T[]) =>
    Array.from({ length: Math.max(a.length, b.length) }, (_, index) => [a[index], b[index]])
        .flat()
        .filter((job): job is T => job !== undefined);
