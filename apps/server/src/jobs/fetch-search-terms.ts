import { z } from 'zod';
import {
    setSearchTermsFetchCompleted,
    setSearchTermsFetchFailed,
    setSearchTermsFetchInProgress,
} from '@/db/search-terms/fetch-status.js';
import { saveSearchTermsSnapshot } from '@/db/search-terms/snapshots.js';
import { defineJob } from '@/jobs/job-router.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces.js';
import { fetchBaKeywordsSnapshot } from '@/services/spapi/ba-keywords-service.js';
import { getPacificDateString } from '@/utils/date.js';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const fetchSearchTermsInput = z.object({
    dataEndDate: z.string().regex(dateRegex),
    dataStartDate: z.string().regex(dateRegex),
    marketplaceId: z.literal(SPAPI_US_MARKETPLACE_ID),
    reportPeriod: z.enum(['MONTH', 'WEEK']),
});

export const fetchSearchTermsJob = defineJob('fetch-search-terms-report', {
    persistSuccess: 'didWork',
    startupSummary: 'event-driven',
})
    .input(fetchSearchTermsInput)
    .options({
        retryLimit: 0,
    })
    .work(async (job, signal, log) => {
        void signal;
        const startedAt = new Date();
        const jobId = String(job.id);

        await setSearchTermsFetchInProgress({
            window: job.data,
            jobId,
            startedAt,
        });

        try {
            const snapshot = await fetchBaKeywordsSnapshot(job.data);
            const topRejectedReasons = Object.entries(snapshot.debug.rejectedByReason)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([reason, count]) => `${reason}:${count}`);

            log('Search Terms parse diagnostics', {
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

            const persistedSnapshot = await saveSearchTermsSnapshot({
                window: job.data,
                observedDate: getPacificDateString(),
                reportId: snapshot.reportId,
                sourceJobId: jobId,
                fetchedAt: new Date(snapshot.fetchedAt),
                rows: snapshot.rows,
            });

            const completedAt = new Date();
            await setSearchTermsFetchCompleted({
                window: job.data,
                snapshotId: persistedSnapshot.id,
                completedAt,
            });

            const result = {
                didWork: true,
                dataEndDate: job.data.dataEndDate,
                dataStartDate: job.data.dataStartDate,
                fetchedAt: persistedSnapshot.fetchedAt,
                keywordCount: persistedSnapshot.keywordCount,
                marketplaceId: job.data.marketplaceId,
                reportId: persistedSnapshot.reportId,
                reportPeriod: job.data.reportPeriod,
                snapshotId: persistedSnapshot.id,
            };

            log('Fetched and persisted Search Terms snapshot', {
                reportId: result.reportId,
                keywordCount: result.keywordCount,
                snapshotId: result.snapshotId,
                dataStartDate: result.dataStartDate,
                dataEndDate: result.dataEndDate,
            });

            return result;
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            await setSearchTermsFetchFailed({
                window: job.data,
                errorMessage,
                failedAt: new Date(),
            });

            log('Search Terms fetch job failed', {
                error: errorMessage,
                dataStartDate: job.data.dataStartDate,
                dataEndDate: job.data.dataEndDate,
                marketplaceId: job.data.marketplaceId,
                reportPeriod: job.data.reportPeriod,
            });
            throw error;
        }
    });
