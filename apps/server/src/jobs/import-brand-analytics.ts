import { z } from 'zod';
import { advanceBrandAnalyticsImport } from '@/services/brand-analytics-import';
import { defineJob } from './job-router';
import { keywordQueues } from './keyword-job-queues';

// One step of the weekly Brand Analytics import: request the report, check it, or download and
// save it. schedule-keyword-work enqueues the import whenever its next step is due.
export const importBrandAnalyticsJob = defineJob(keywordQueues.brandAnalytics, {
    persistSuccess: 'didWork',
    startupSummary: 'weekly Brand Analytics search terms import, one SP-API Reports step per job',
})
    .input(z.object({ importId: z.string().uuid() }))
    // Downloading and aggregating a weekly report takes minutes, longer than other keyword jobs.
    .queue({ policy: 'exclusive', retryLimit: 0, expireInSeconds: 3600 })
    .work(job => advanceBrandAnalyticsImport(job.data.importId));
