import { z } from 'zod';
import { alwaysOpenGate } from '@/db/provider-gates';
import { advanceBrandAnalyticsImport } from '@/services/brand-analytics-import';
import { defineJob } from './job-router';
import { keywordQueues } from './keyword-job-queues';
import { queueBrandAnalyticsKeywords } from './register-brand-analytics-keywords';

// One step of the weekly Brand Analytics import: request the report, check it, or download and
// save it. Each unfinished step queues the next for its time; a saved import queues keyword listing.
// Runs regardless of Pause sync: one free report a week, no scan capacity.
export const importBrandAnalyticsJob = defineJob(keywordQueues.brandAnalytics, {
    persistSuccess: 'didWork',
    startupSummary: 'Brand Analytics import, one SP-API Reports step per job, self-scheduled',
})
    .input(z.object({ importId: z.string().uuid() }))
    // Downloading and aggregating a weekly report takes minutes, longer than other keyword jobs.
    .queue({ policy: 'exclusive', retryLimit: 0, expireInSeconds: 3600 })
    .gate(alwaysOpenGate)
    .work(async (job, _signal, _log, { boss }) => {
        const result = await advanceBrandAnalyticsImport(job.data.importId);
        if (result.kind === 'imported') await queueBrandAnalyticsKeywords(boss);
        return result;
    });
