import { z } from 'zod';
import { getTopSearchTermsDatasetById } from '@/db/top-search-terms/datasets.js';
import {
    setTopSearchTermsDatasetCompleted,
    setTopSearchTermsDatasetFailed,
    setTopSearchTermsDatasetInProgress,
    setTopSearchTermsDatasetReportPending,
    setTopSearchTermsDatasetReportRequested,
} from '@/db/top-search-terms/dataset-status.js';
import { saveTopSearchTermsSnapshot } from '@/db/top-search-terms/snapshots.js';
import { defineJob } from '@/jobs/job-router.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import {
    getNextRefreshAtAfterSuccess,
    getRetryRefreshAt,
} from '@/services/top-search-terms-dataset-windows.js';
import {
    TOP_SEARCH_TERMS_FETCH_GROUP_CONCURRENCY,
    TOP_SEARCH_TERMS_FETCH_LOCAL_CONCURRENCY,
} from '@/services/top-search-terms-jobs.js';
import {
    downloadBaKeywordsSnapshot,
    getBaKeywordsReportStatus,
    requestBaKeywordsReport,
} from '@/services/spapi/ba-keywords-service.js';
import { SpApiBackoffError } from '@/services/spapi/spapi-backoff.js';
import {
    getTopSearchTermsReportAction,
    getTopSearchTermsReportRecheckAt,
    isTopSearchTermsReportPendingTimedOut,
} from '@/services/top-search-terms-report-state-machine.js';
import { getPacificDateString } from '@/utils/date.js';

const fetchTopSearchTermsDatasetInput = z.object({
    datasetId: z.string().uuid(),
});

export const fetchTopSearchTermsDatasetJob = defineJob('fetch-top-search-terms-dataset', {
    persistSuccess: 'didWork',
    startupSummary: 'event-driven',
})
    .input(fetchTopSearchTermsDatasetInput)
    .options({ retryLimit: 0 })
    .workOptions({
        batchSize: 1,
        groupConcurrency: TOP_SEARCH_TERMS_FETCH_GROUP_CONCURRENCY,
        localConcurrency: TOP_SEARCH_TERMS_FETCH_LOCAL_CONCURRENCY,
    })
    .work(async (job, signal, log) => {
        void signal;
        const dataset = await getTopSearchTermsDatasetById(job.data.datasetId);
        if (!dataset) {
            return {
                didWork: false,
                reason: 'dataset_not_found',
            };
        }

        const startedAt = new Date();
        const jobId = String(job.id);
        await setTopSearchTermsDatasetInProgress({
            datasetId: dataset.id,
            jobId,
            startedAt,
        });

        let reportIdOnFailure: string | null | undefined;

        try {
            if (!dataset.reportId) {
                const reportId = await requestBaKeywordsReport({
                    dataEndDate: dataset.dataEndDate,
                    dataStartDate: dataset.dataStartDate,
                    marketplaceId: dataset.marketplaceId,
                    reportPeriod: dataset.reportPeriod,
                });
                const nextRefreshAt = getTopSearchTermsReportRecheckAt(startedAt);

                await setTopSearchTermsDatasetReportRequested({
                    datasetId: dataset.id,
                    reportId,
                    requestedAt: startedAt,
                    nextRefreshAt,
                });

                log('Top Search Terms report requested', {
                    datasetId: dataset.id,
                    reportId,
                    reportPeriod: dataset.reportPeriod,
                    dataStartDate: dataset.dataStartDate,
                    dataEndDate: dataset.dataEndDate,
                    nextRefreshAt: nextRefreshAt.toISOString(),
                });

                return {
                    didWork: true,
                    datasetId: dataset.id,
                    reportId,
                    reportPeriod: dataset.reportPeriod,
                    dataStartDate: dataset.dataStartDate,
                    dataEndDate: dataset.dataEndDate,
                    nextRefreshAt: nextRefreshAt.toISOString(),
                    step: 'report_requested',
                };
            }

            const reportPendingSince = getTopSearchTermsReportPendingSince(dataset);
            if (
                reportPendingSince &&
                isTopSearchTermsReportPendingTimedOut({
                    pendingSince: reportPendingSince,
                    now: startedAt,
                })
            ) {
                reportIdOnFailure = null;
                throw new Error(
                    `BA report ${dataset.reportId} remained pending for over 3 hours.`
                );
            }

            const reportStatus = await getBaKeywordsReportStatus(dataset.reportId);
            const reportAction = getTopSearchTermsReportAction({
                reportId: dataset.reportId,
                reportStatus: reportStatus.processingStatus,
                reportDocumentId: reportStatus.reportDocumentId,
            });

            if (reportAction.type === 'check_later') {
                const checkedAt = new Date();
                const nextRefreshAt = getTopSearchTermsReportRecheckAt(checkedAt);
                await setTopSearchTermsDatasetReportPending({
                    datasetId: dataset.id,
                    checkedAt,
                    nextRefreshAt,
                });

                log('Top Search Terms report still processing; scheduled recheck', {
                    datasetId: dataset.id,
                    reportId: dataset.reportId,
                    processingStatus: reportStatus.processingStatus,
                    nextRefreshAt: nextRefreshAt.toISOString(),
                });

                return {
                    didWork: false,
                    datasetId: dataset.id,
                    reportId: dataset.reportId,
                    processingStatus: reportStatus.processingStatus,
                    step: 'report_pending',
                };
            }

            if (reportAction.type === 'fail_terminal') {
                reportIdOnFailure = null;
                throw new Error(reportAction.reason);
            }

            const snapshot = await downloadBaKeywordsSnapshot({
                params: {
                    dataEndDate: dataset.dataEndDate,
                    dataStartDate: dataset.dataStartDate,
                    marketplaceId: dataset.marketplaceId,
                    reportPeriod: dataset.reportPeriod,
                },
                reportDocumentId: reportAction.reportDocumentId,
                reportId: dataset.reportId,
            });

            const topRejectedReasons = Object.entries(snapshot.debug.rejectedByReason)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([reason, count]) => `${reason}:${count}`);

            log('Top Search Terms parse diagnostics', {
                reportId: snapshot.reportId,
                parsedObjectRows: snapshot.debug.parsedObjectRows,
                malformedObjectRows: snapshot.debug.malformedObjectRows,
                dataArrayDetected: snapshot.debug.dataArrayDetected,
                acceptedTopRows: snapshot.debug.acceptedTopRows,
                keptKeywordCount: snapshot.debug.keptKeywordCount,
                emptySearchTermRows: snapshot.debug.emptySearchTermRows,
                invalidRankRows: snapshot.debug.invalidRankRows,
                topRejectedReasons,
            });

            const persistedSnapshot = await saveTopSearchTermsSnapshot({
                datasetId: dataset.id,
                window: {
                    marketplaceId: dataset.marketplaceId,
                    reportPeriod: dataset.reportPeriod,
                    dataStartDate: dataset.dataStartDate,
                    dataEndDate: dataset.dataEndDate,
                },
                observedDate: getPacificDateString(),
                reportId: snapshot.reportId,
                sourceJobId: jobId,
                fetchedAt: new Date(snapshot.fetchedAt),
                rows: snapshot.rows,
            });

            const completedAt = new Date();
            await setTopSearchTermsDatasetCompleted({
                datasetId: dataset.id,
                completedAt,
                reportId: null,
                nextRefreshAt: getNextRefreshAtAfterSuccess({
                    dataset,
                    now: completedAt,
                    today: getPacificDateString(),
                }),
            });

            log('Fetched and persisted Top Search Terms dataset', {
                datasetId: dataset.id,
                reportId: snapshot.reportId,
                reportPeriod: dataset.reportPeriod,
                dataStartDate: dataset.dataStartDate,
                dataEndDate: dataset.dataEndDate,
                keywordCount: persistedSnapshot.keywordCount,
            });

            return {
                didWork: true,
                datasetId: dataset.id,
                reportId: snapshot.reportId,
                reportPeriod: dataset.reportPeriod,
                dataStartDate: dataset.dataStartDate,
                dataEndDate: dataset.dataEndDate,
                fetchedAt: persistedSnapshot.fetchedAt,
                keywordCount: persistedSnapshot.keywordCount,
                snapshotId: persistedSnapshot.id,
                step: 'report_processed',
            };
        } catch (error) {
            if (
                dataset.reportId &&
                error instanceof SpApiBackoffError &&
                !error.retryable
            ) {
                // Non-retryable status/download errors should drop stale report ids.
                reportIdOnFailure = null;
            }

            const failedAt = new Date();
            const errorMessage = getErrorMessage(error);
            await setTopSearchTermsDatasetFailed({
                datasetId: dataset.id,
                errorMessage,
                failedAt,
                reportId: reportIdOnFailure,
                nextRefreshAt: getRetryRefreshAt(failedAt),
            });

            log('Top Search Terms dataset fetch failed', {
                datasetId: dataset.id,
                reportPeriod: dataset.reportPeriod,
                dataStartDate: dataset.dataStartDate,
                dataEndDate: dataset.dataEndDate,
                error: errorMessage,
            });
            throw error;
        }
    });

const getTopSearchTermsReportPendingSince = (
    dataset: Awaited<ReturnType<typeof getTopSearchTermsDatasetById>>
) => {
    if (!dataset) {
        return null;
    }

    const pendingSinceIso = dataset.fetchStartedAt ?? dataset.activeJobRequestedAt;
    if (!pendingSinceIso) {
        return null;
    }

    return new Date(pendingSinceIso);
};
