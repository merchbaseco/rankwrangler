import { z } from 'zod';
import { scheduleBrandAnalytics } from '@/services/brand-analytics-scheduler';
import { defineJob } from './job-router';

// Every six hours, independent of Pause sync: start a newly published week's import and catch up
// keyword listing. A week publishes a couple of days after it ends, so this is soon enough.
export const scheduleBrandAnalyticsJob = defineJob('schedule-brand-analytics', {
    persistSuccess: 'didWork',
    startupSummary: 'every six hours; starts the weekly Brand Analytics import when due',
})
    .input(z.object({}))
    .queue({ policy: 'singleton' })
    .interval({ everyMs: 6 * 60 * 60_000, payload: {} })
    .work((_job, _signal, _log, { boss }) =>
        scheduleBrandAnalytics(boss)
    );
