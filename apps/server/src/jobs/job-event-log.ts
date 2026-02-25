import { getErrorMessage } from '@/services/job-executions-utils.js';
import { createEventLogSafe } from '@/services/event-logs.js';
import { getJobLogAction, getJobLogLabel } from './job-log-action.js';

export const logJobCompleted = async ({
    input,
    jobId,
    jobName,
    result,
}: {
    jobName: string;
    jobId: string;
    input: unknown;
    result: unknown;
}) => {
    await createEventLogSafe({
        level: 'info',
        status: 'success',
        category: 'job',
        action: getJobLogAction(jobName, 'completed'),
        primitiveType: 'job',
        message: `${getJobLogLabel(jobName)} completed.`,
        detailsJson: {
            input,
            jobName,
            result,
            source: 'pg_boss',
        },
        jobName,
        jobRunId: jobId,
        requestId: jobId,
    });
};

export const logJobFailed = async ({
    error,
    input,
    jobId,
    jobName,
}: {
    jobName: string;
    jobId: string;
    input: unknown;
    error: unknown;
}) => {
    await createEventLogSafe({
        level: 'error',
        status: 'failed',
        category: 'job',
        action: getJobLogAction(jobName, 'failed'),
        primitiveType: 'job',
        message: `${getJobLogLabel(jobName)} failed.`,
        detailsJson: {
            error: getErrorMessage(error),
            input,
            jobName,
            source: 'pg_boss',
        },
        jobName,
        jobRunId: jobId,
        requestId: jobId,
    });
};
