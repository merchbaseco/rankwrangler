import { z } from 'zod';
import { EVENT_LOG_RETENTION_MS } from '@/db/event-log-count-fold';
import { deleteExpiredEventLogCounts, deleteExpiredEventLogs } from '@/db/event-log-retention';
import { defineJob } from '@/jobs/job-router';

const EVENT_LOG_DELETE_BATCH_SIZE = 10_000;
const EVENT_LOG_DELETE_MAX_BATCHES = 30;

interface PruneEventLogsDeps {
    deleteBatch: typeof deleteExpiredEventLogs;
    deleteCounts: typeof deleteExpiredEventLogCounts;
    now: () => Date;
}

const defaultDeps: PruneEventLogsDeps = {
    deleteBatch: deleteExpiredEventLogs,
    deleteCounts: deleteExpiredEventLogCounts,
    now: () => new Date(),
};

/**
 * Deletes events, and their folded counts, older than thirty days. Events arrive at about 170,000
 * a day, so a day's deletes are 17 batches of 10,000; a run stops after 30 batches and a backlog
 * drains over the following days instead of one long run.
 */
export const pruneEventLogs = async (overrides: Partial<PruneEventLogsDeps> = {}) => {
    const deps = { ...defaultDeps, ...overrides };
    const before = new Date(deps.now().getTime() - EVENT_LOG_RETENTION_MS);
    let deletedCount = 0;
    let batchCount = 0;
    while (batchCount < EVENT_LOG_DELETE_MAX_BATCHES) {
        const deleted = await deps.deleteBatch({ before, batchSize: EVENT_LOG_DELETE_BATCH_SIZE });
        deletedCount += deleted;
        batchCount += 1;
        if (deleted < EVENT_LOG_DELETE_BATCH_SIZE) break;
    }
    const countsDeleted = await deps.deleteCounts({ before });
    return {
        didWork: deletedCount + countsDeleted > 0,
        deletedCount,
        countsDeleted,
        reachedDeleteLimit: batchCount === EVENT_LOG_DELETE_MAX_BATCHES,
    };
};

export const pruneEventLogsJob = defineJob('prune-event-logs', {
    startupSummary: 'daily thirty-day event-log retention cleanup',
    persistSuccess: 'didWork',
})
    .input(z.object({}))
    .queue({ policy: 'exclusive' })
    .cron({ cron: '15 3 * * *', payload: {} })
    .work(async (_job, _signal, log) => {
        const result = await pruneEventLogs();
        if (result.reachedDeleteLimit)
            log('Event-log cleanup reached its bounded delete limit', result, 'warn');
        return result;
    });
