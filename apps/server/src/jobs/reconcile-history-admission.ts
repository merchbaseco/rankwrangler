import { z } from 'zod';
import { reconcileHistoryAdmission } from '@/services/reconcile-history-admission';
import { defineJob } from './job-router';

export const reconcileHistoryAdmissionJob = defineJob('reconcile-history-admission', {
    persistSuccess: 'didWork',
    startupSummary: 'measured-capacity Product history admission and overload protection',
})
    .input(z.object({}))
    .options({ singletonKey: 'reconcile-history-admission', retryLimit: 0 })
    .interval({ everyMs: 60_000, payload: {} })
    .work(async () => await reconcileHistoryAdmission());
