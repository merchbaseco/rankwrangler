import { z } from 'zod';
import {
    deleteTopSearchTermsDailyDatasetsBefore,
    insertMissingTopSearchTermsDatasets,
    listDueTopSearchTermsDatasets,
} from '@/db/top-search-terms/datasets.js';
import { setTopSearchTermsDatasetQueued } from '@/db/top-search-terms/dataset-status.js';
import { defineJob } from '@/jobs/job-router.js';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces.js';
import {
    buildDailyTopSearchTermsWindows,
    buildWeeklyTopSearchTermsWindows,
    getDailyRetentionCutoffDate,
    TOP_SEARCH_TERMS_DAILY_RETENTION_DAYS,
    TOP_SEARCH_TERMS_SCHEDULER_BATCH_SIZE,
    TOP_SEARCH_TERMS_WEEKLY_BACKFILL_WEEKS,
} from '@/services/top-search-terms-dataset-windows.js';
import { sendFetchTopSearchTermsDatasetJob } from '@/services/top-search-terms-jobs.js';
import { getPacificDateString } from '@/utils/date.js';

const syncTopSearchTermsDatasetsInput = z.object({});

export const syncTopSearchTermsDatasetsJob = defineJob('sync-top-search-terms-datasets', {
    persistSuccess: 'didWork',
    startupSummary: 'cron: every 30m',
})
    .input(syncTopSearchTermsDatasetsInput)
    .cron({ cron: '*/30 * * * *', payload: {} })
    .options({
        singletonKey: 'sync-top-search-terms-datasets',
        retryLimit: 0,
    })
    .work(async (_job, signal, log) => {
        void signal;
        const now = new Date();
        const today = getPacificDateString();

        const dailyWindows = buildDailyTopSearchTermsWindows({
            marketplaceId: SPAPI_US_MARKETPLACE_ID,
            today,
            days: TOP_SEARCH_TERMS_DAILY_RETENTION_DAYS,
        });
        const weeklyWindows = buildWeeklyTopSearchTermsWindows({
            marketplaceId: SPAPI_US_MARKETPLACE_ID,
            today,
            weeks: TOP_SEARCH_TERMS_WEEKLY_BACKFILL_WEEKS,
        });
        const insertedCount = await insertMissingTopSearchTermsDatasets({
            windows: [...dailyWindows, ...weeklyWindows],
            nextRefreshAt: now,
        });

        const dailyCutoff = getDailyRetentionCutoffDate({
            today,
            retentionDays: TOP_SEARCH_TERMS_DAILY_RETENTION_DAYS,
        });
        const deletedCount = await deleteTopSearchTermsDailyDatasetsBefore({
            marketplaceId: SPAPI_US_MARKETPLACE_ID,
            cutoffDateExclusive: dailyCutoff,
        });

        const dueDatasets = await listDueTopSearchTermsDatasets({
            marketplaceId: SPAPI_US_MARKETPLACE_ID,
            now,
            limit: TOP_SEARCH_TERMS_SCHEDULER_BATCH_SIZE,
        });

        let queuedCount = 0;
        for (const dataset of dueDatasets) {
            const jobId = await sendFetchTopSearchTermsDatasetJob({ datasetId: dataset.id });
            if (!jobId) {
                continue;
            }

            await setTopSearchTermsDatasetQueued({
                datasetId: dataset.id,
                jobId,
                requestedAt: now,
            });
            queuedCount += 1;
        }

        log('Top Search Terms datasets sync complete', {
            insertedCount,
            deletedCount,
            dueCount: dueDatasets.length,
            queuedCount,
            retentionDays: TOP_SEARCH_TERMS_DAILY_RETENTION_DAYS,
            weeklyBackfillWeeks: TOP_SEARCH_TERMS_WEEKLY_BACKFILL_WEEKS,
        });

        return {
            didWork: insertedCount > 0 || deletedCount > 0 || queuedCount > 0,
            insertedCount,
            deletedCount,
            dueCount: dueDatasets.length,
            queuedCount,
        };
    });
