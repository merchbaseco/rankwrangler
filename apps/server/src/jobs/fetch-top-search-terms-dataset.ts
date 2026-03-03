import { z } from 'zod';
import { getTopSearchTermsDatasetById } from '@/db/top-search-terms/datasets.js';
import {
    setTopSearchTermsDatasetCompleted,
    setTopSearchTermsDatasetFailed,
    setTopSearchTermsDatasetInProgress,
} from '@/db/top-search-terms/dataset-status.js';
import { saveTopSearchTermsSnapshot } from '@/db/top-search-terms/snapshots.js';
import { defineJob } from '@/jobs/job-router.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import {
    getNextRefreshAtAfterSuccess,
    getRetryRefreshAt,
} from '@/services/top-search-terms-dataset-windows.js';
import { fetchBaKeywordsSnapshot } from '@/services/spapi/ba-keywords-service.js';
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

        try {
            const snapshot = await fetchBaKeywordsSnapshot({
                dataEndDate: dataset.dataEndDate,
                dataStartDate: dataset.dataStartDate,
                marketplaceId: dataset.marketplaceId,
                reportPeriod: dataset.reportPeriod,
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
                reportId: snapshot.reportId,
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
            };
        } catch (error) {
            const failedAt = new Date();
            const errorMessage = getErrorMessage(error);
            await setTopSearchTermsDatasetFailed({
                datasetId: dataset.id,
                errorMessage,
                failedAt,
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
