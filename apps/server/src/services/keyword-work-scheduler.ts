import type { JobInsert } from 'pg-boss';
import { isAutomaticSyncPaused } from '@/db/automatic-sync';
import { readScanBacklog } from '@/db/keyword-scan-backlog';
import {
    listDueAutocomplete,
    listDueKeywordScans,
    listDueProductMining,
    listUnminedProducts,
} from '@/db/keyword-work-due';
import { promoteWaitingJobs } from '@/db/job-queue-status';
import { keywordQueues, scanPriority } from '@/jobs/keyword-job-queues';

type QueueName = (typeof keywordQueues)[keyof typeof keywordQueues];
type Deps = {
    isPaused: () => Promise<boolean>;
    backlog: typeof readScanBacklog;
    dueScans: typeof listDueKeywordScans;
    dueMining: typeof listDueProductMining;
    unmined: typeof listUnminedProducts;
    dueAutocomplete: typeof listDueAutocomplete;
    promote: typeof promoteWaitingJobs;
    queued: (name: QueueName) => Promise<number>;
    insert: (name: QueueName, jobs: JobInsert[]) => Promise<number>;
};
type QueueAccess = Pick<Deps, 'queued' | 'insert'>;

// Enqueues due keyword-pipeline work; it calls no provider. Jobs already queued for an entity are
// skipped by the queue, so enqueueing everything due each minute is safe. Producers (Ads mining,
// autocomplete) are topped up only to a short queue, and only while scan backlog allows.
export const scheduleKeywordWork = async (queues: QueueAccess, overrides: Partial<Deps> = {}) => {
    const deps: Deps = { ...defaults, ...queues, ...overrides };
    if (await deps.isPaused()) return { didWork: false, paused: true };
    const now = new Date();
    const backlog = await deps.backlog(now);
    const scans = await deps.dueScans(now, scanBatch);
    const savedProducts = await deps.dueMining(now, 'recommendationsSaved', judgmentBatch);
    const savedSeeds = await deps.dueAutocomplete(now, 'suggestionsSaved', judgmentBatch);
    const enqueued = {
        scanHeads: await deps.insert(keywordQueues.scan, scanJobs(scans, false)),
        scanDepth: await deps.insert(keywordQueues.scan, scanJobs(scans, true)),
        judgments: await deps.insert(keywordQueues.judge, [
            ...savedProducts.map(row => judgmentJob('product', row.id)),
            ...savedSeeds.map(row => judgmentJob('seed', row.id)),
        ]),
        recommendations: 0,
        autocomplete: 0,
        // Depth waiting six hours joins the heads, well before its SP-API cursor expires at a day.
        depthPromoted: await deps.promote(keywordQueues.scan, {
            from: scanPriority.depth,
            to: scanPriority.head,
            waitingSince: new Date(now.getTime() - depthAgingMs),
        }),
    };
    if (backlog.producersOpen) {
        const adsRoom = producerDepth - (await deps.queued(keywordQueues.recommend));
        if (adsRoom > 0) {
            const retries = await deps.dueMining(now, 'pending', adsRoom);
            const fresh =
                adsRoom > retries.length ? await deps.unmined(adsRoom - retries.length) : [];
            enqueued.recommendations = await deps.insert(
                keywordQueues.recommend,
                [...retries, ...fresh].map(row => ({ data: { productId: row.id }, singletonKey: row.id }))
            );
        }
        const seedRoom = producerDepth - (await deps.queued(keywordQueues.autocomplete));
        if (seedRoom > 0)
            enqueued.autocomplete = await deps.insert(
                keywordQueues.autocomplete,
                (await deps.dueAutocomplete(now, 'pending', seedRoom)).map(row => ({
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

// About five minutes of Ads or autocomplete starts at their ten-second spacing.
const producerDepth = 30;
const depthAgingMs = 6 * 60 * 60 * 1000;
const scanBatch = 1000;
const judgmentBatch = 200;
const defaults: Omit<Deps, keyof QueueAccess> = {
    isPaused: () => isAutomaticSyncPaused(),
    backlog: readScanBacklog,
    dueScans: listDueKeywordScans,
    dueMining: listDueProductMining,
    unmined: listUnminedProducts,
    dueAutocomplete: listDueAutocomplete,
    promote: promoteWaitingJobs,
};
const scanJobs = (rows: readonly { id: string; depth: boolean }[], depth: boolean) =>
    rows
        .filter(row => row.depth === depth)
        .map(row => ({
            data: { targetId: row.id },
            singletonKey: row.id,
            priority: depth ? scanPriority.depth : scanPriority.head,
        }));
const judgmentJob = (kind: 'product' | 'seed', id: string) =>
    kind === 'product'
        ? { data: { kind, productId: id }, singletonKey: `product:${id}` }
        : { data: { kind, queryId: id }, singletonKey: `seed:${id}` };
