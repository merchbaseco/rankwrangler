import { z } from 'zod';
import { env } from '@/config/env.js';
import { defineJob } from '@/jobs/job-router.js';
import { createEventLogSafe as createEventLogSafeService } from '@/services/event-logs.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import {
    countQueuedKeepaRefreshes as countQueuedKeepaRefreshesService,
    enqueueKeepaScheduledRefreshCandidates as enqueueKeepaScheduledRefreshCandidatesService,
    getKeepaRefreshQueueTarget as getKeepaRefreshQueueTargetService,
    getKeepaScheduledRefreshCandidates as getKeepaScheduledRefreshCandidatesService,
} from '@/services/keepa-scheduled-refresh.js';

// Frequent short top-ups keep the queue near its target, so the per-minute dispatcher always has
// due work for every token above the live reserve without a long backlog in front of it.
const KEEPA_SCHEDULED_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export type EnqueueScheduledKeepaHistoryRefreshResult = {
    didWork: boolean;
    queuedBefore: number;
    target: number;
    dueCount: number;
    reason: 'enqueued' | 'queue_full' | 'no_candidates' | 'keepa_not_configured';
};

type EnqueueScheduledKeepaHistoryRefreshDeps = {
    createEventLogSafe: typeof createEventLogSafeService;
    countQueuedKeepaRefreshes: typeof countQueuedKeepaRefreshesService;
    getKeepaRefreshQueueTarget: typeof getKeepaRefreshQueueTargetService;
    getKeepaScheduledRefreshCandidates: typeof getKeepaScheduledRefreshCandidatesService;
    enqueueKeepaScheduledRefreshCandidates: typeof enqueueKeepaScheduledRefreshCandidatesService;
    isKeepaConfigured: () => boolean;
};

const enqueueScheduledKeepaHistoryRefreshJobDeps: EnqueueScheduledKeepaHistoryRefreshDeps = {
    createEventLogSafe: createEventLogSafeService,
    countQueuedKeepaRefreshes: countQueuedKeepaRefreshesService,
    getKeepaRefreshQueueTarget: getKeepaRefreshQueueTargetService,
    getKeepaScheduledRefreshCandidates: getKeepaScheduledRefreshCandidatesService,
    enqueueKeepaScheduledRefreshCandidates: enqueueKeepaScheduledRefreshCandidatesService,
    isKeepaConfigured: () => Boolean(env.RANKWRANGLER_KEEPA_API_KEY),
};

/**
 * Tops the Keepa history queue up to about half an hour of refill with tier-due Products, best BSR
 * first. The dispatcher spends only tokens above the live reserve, so live requests keep their
 * headroom however full the queue is.
 */
export const enqueueScheduledKeepaHistoryRefresh = async (
    deps: EnqueueScheduledKeepaHistoryRefreshDeps = enqueueScheduledKeepaHistoryRefreshJobDeps
): Promise<EnqueueScheduledKeepaHistoryRefreshResult> => {
    if (!deps.isKeepaConfigured()) {
        return result('keepa_not_configured', { queuedBefore: 0, target: 0 });
    }

    const [queuedBefore, target] = await Promise.all([
        deps.countQueuedKeepaRefreshes(),
        deps.getKeepaRefreshQueueTarget(),
    ]);
    const room = target - queuedBefore;
    if (room <= 0) {
        return result('queue_full', { queuedBefore, target });
    }

    const due = await deps.getKeepaScheduledRefreshCandidates({ limit: room });
    const dueCount = due.length ? await deps.enqueueKeepaScheduledRefreshCandidates(due) : 0;
    if (dueCount === 0) {
        return result('no_candidates', { queuedBefore, target });
    }
    return { didWork: true, queuedBefore, target, dueCount, reason: 'enqueued' };
};

export const enqueueScheduledKeepaHistoryRefreshJob = defineJob(
    'enqueue-scheduled-keepa-history-refresh',
    {
        startupSummary:
            'every 5 min top-up of tier-due Products to ~30 min of refill',
        persistSuccess: 'always',
    }
)
    .input(z.record(z.string(), z.unknown()))
    .options({
        singletonKey: 'enqueue-scheduled-keepa-history-refresh',
    })
    .interval({
        everyMs: KEEPA_SCHEDULED_REFRESH_INTERVAL_MS,
        payload: {},
    })
    .work(async (job, signal, log) => {
        void signal;
        let outcome: 'completed' | 'failed' = 'completed';

        try {
            const result = await enqueueScheduledKeepaHistoryRefresh();
            if (result.didWork) {
                log('Queued scheduled Keepa refresh candidates', {
                    dueCount: result.dueCount,
                    queuedBefore: result.queuedBefore,
                    target: result.target,
                });
            } else {
                log('Scheduled Keepa enqueue scan completed with no enqueues', {
                    reason: result.reason,
                    queuedBefore: result.queuedBefore,
                    target: result.target,
                });
            }

            return result;
        } catch (error) {
            outcome = 'failed';
            await enqueueScheduledKeepaHistoryRefreshJobDeps.createEventLogSafe({
                level: 'error',
                status: 'failed',
                category: 'job',
                action: 'job.fatal',
                primitiveType: 'job',
                message: 'Fatal job failure in enqueue-scheduled-keepa-history-refresh.',
                detailsJson: {
                    error: getErrorMessage(error),
                    input: job.data,
                    source: 'enqueue_scheduled_keepa_history_refresh_job',
                },
                jobName: 'enqueue-scheduled-keepa-history-refresh',
                jobRunId: String(job.id),
                requestId: String(job.id),
            });
            throw error;
        } finally {
            log('Finished scheduled Keepa enqueue job run', {
                jobId: job.id,
                outcome,
            });
        }
    });

const result = (
    reason: Exclude<EnqueueScheduledKeepaHistoryRefreshResult['reason'], 'enqueued'>,
    counts: { queuedBefore: number; target: number }
): EnqueueScheduledKeepaHistoryRefreshResult => ({
    didWork: false,
    ...counts,
    dueCount: 0,
    reason,
});
