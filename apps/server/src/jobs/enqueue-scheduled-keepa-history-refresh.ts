import { z } from 'zod';
import { env } from '@/config/env.js';
import { defineJob } from '@/jobs/job-router.js';
import { createEventLogSafe as createEventLogSafeService } from '@/services/event-logs.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import {
    enqueueKeepaScheduledRefreshCandidates as enqueueKeepaScheduledRefreshCandidatesService,
    getKeepaScheduledRefreshCandidates as getKeepaScheduledRefreshCandidatesService,
} from '@/services/keepa-scheduled-refresh.js';

const KEEPA_SCHEDULED_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export type EnqueueScheduledKeepaHistoryRefreshResult = {
    didWork: boolean;
    candidateCount: number;
    enqueuedCount: number;
    reason: 'enqueued' | 'already_queued' | 'no_candidates' | 'keepa_not_configured';
};

type EnqueueScheduledKeepaHistoryRefreshDeps = {
    createEventLogSafe: typeof createEventLogSafeService;
    getKeepaScheduledRefreshCandidates: typeof getKeepaScheduledRefreshCandidatesService;
    enqueueKeepaScheduledRefreshCandidates: typeof enqueueKeepaScheduledRefreshCandidatesService;
    isKeepaConfigured: () => boolean;
};

const enqueueScheduledKeepaHistoryRefreshJobDeps: EnqueueScheduledKeepaHistoryRefreshDeps = {
    createEventLogSafe: createEventLogSafeService,
    getKeepaScheduledRefreshCandidates: getKeepaScheduledRefreshCandidatesService,
    enqueueKeepaScheduledRefreshCandidates: enqueueKeepaScheduledRefreshCandidatesService,
    isKeepaConfigured: () => Boolean(env.KEEPA_API_KEY),
};

export const enqueueScheduledKeepaHistoryRefresh = async (
    deps: EnqueueScheduledKeepaHistoryRefreshDeps = enqueueScheduledKeepaHistoryRefreshJobDeps
): Promise<EnqueueScheduledKeepaHistoryRefreshResult> => {
    if (!deps.isKeepaConfigured()) {
        return {
            didWork: false,
            candidateCount: 0,
            enqueuedCount: 0,
            reason: 'keepa_not_configured',
        } as const;
    }

    const candidates = await deps.getKeepaScheduledRefreshCandidates();
    if (candidates.length === 0) {
        return {
            didWork: false,
            candidateCount: 0,
            enqueuedCount: 0,
            reason: 'no_candidates',
        } as const;
    }

    const enqueuedCount = await deps.enqueueKeepaScheduledRefreshCandidates(candidates);
    if (enqueuedCount === 0) {
        return {
            didWork: false,
            candidateCount: candidates.length,
            enqueuedCount,
            reason: 'already_queued',
        } as const;
    }

    return {
        didWork: true,
        candidateCount: candidates.length,
        enqueuedCount,
        reason: 'enqueued',
    } as const;
};

export const enqueueScheduledKeepaHistoryRefreshJob = defineJob(
    'enqueue-scheduled-keepa-history-refresh',
    {
        startupSummary: 'hourly scan (<300k daily, <1M weekly)',
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
                    candidateCount: result.candidateCount,
                    enqueuedCount: result.enqueuedCount,
                });
            } else {
                log('Scheduled Keepa enqueue scan completed with no enqueues', {
                    reason: result.reason,
                    candidateCount: result.candidateCount,
                    enqueuedCount: result.enqueuedCount,
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
