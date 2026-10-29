import { z } from 'zod';
import { defineJob } from '@/jobs/job-router';
import { deleteExpiredJobExecutions } from '@/db/job-execution-retention';

const JOB_EXECUTION_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const JOB_EXECUTION_DELETE_BATCH_SIZE = 10_000;
const JOB_EXECUTION_DELETE_MAX_BATCHES = 20;

// Entity jobs record roughly one run per external call, so run history needs a retention bound.
export const pruneJobExecutions = async (
    deleteBatch = deleteExpiredJobExecutions,
    now = new Date()
) => {
    const before = new Date(now.getTime() - JOB_EXECUTION_RETENTION_MS);
    let deletedCount = 0;
    let batchCount = 0;
    while (batchCount < JOB_EXECUTION_DELETE_MAX_BATCHES) {
        const deleted = await deleteBatch({ before, batchSize: JOB_EXECUTION_DELETE_BATCH_SIZE });
        deletedCount += deleted;
        batchCount += 1;
        if (deleted < JOB_EXECUTION_DELETE_BATCH_SIZE) break;
    }
    return {
        didWork: deletedCount > 0,
        deletedCount,
        reachedDeleteLimit: batchCount === JOB_EXECUTION_DELETE_MAX_BATCHES,
    };
};

export const pruneJobExecutionsJob = defineJob('prune-job-executions', {
    startupSummary: 'daily fourteen-day job-execution retention cleanup',
    persistSuccess: 'didWork',
})
    .input(z.object({}))
    .options({ singletonKey: 'prune-job-executions' })
    .cron({ cron: '45 2 * * *', payload: {} })
    .work(async (_job, _signal, log) => {
        const result = await pruneJobExecutions();
        if (result.reachedDeleteLimit)
            log('Job-execution cleanup reached its bounded delete limit', result, 'warn');
        return result;
    });
