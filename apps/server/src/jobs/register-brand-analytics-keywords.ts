import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { registerBrandAnalyticsTrials } from '@/db/brand-analytics-trials';
import { alwaysOpenGate } from '@/db/provider-gates';
import { defineJob } from './job-router';
import { keywordQueueOptions, keywordQueues } from './keyword-job-queues';

// Lists imported Brand Analytics searches as queued trial keywords, most searched first, one batch
// per job, queueing the next batch until none remain. Runs regardless of Pause sync; only the
// scans that move these keywords along wait for it.
export const registerBrandAnalyticsKeywordsJob = defineJob(keywordQueues.brandAnalyticsKeywords, {
    persistSuccess: 'didWork',
    startupSummary: 'lists imported Brand Analytics searches as keywords in batches after import',
})
    .input(z.object({}))
    .queue(keywordQueueOptions)
    .gate(alwaysOpenGate)
    .work(async () => {
        const registered = await registerBrandAnalyticsTrials(registrationBatch);
        return {
            didWork: registered > 0,
            registered,
            followup: registered === registrationBatch ? { at: new Date() } : null,
        };
    });

export const queueBrandAnalyticsKeywords = (boss: Pick<PgBoss, 'send'>) =>
    boss.send(keywordQueues.brandAnalyticsKeywords, {}, { singletonKey: registrationKey });

// A first ~200k-term import is listed in about a hundred short jobs.
const registrationBatch = 2000;
const registrationKey = 'brand-analytics-keywords';
