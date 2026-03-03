export type JobStatusFilter = 'success' | 'failed';

export type AdminStatLabel =
    | 'Keepa Fetches'
    | 'Job Successes'
    | 'Job Failures'
    | 'SP-API Jobs Run'
    | 'SP-API Jobs Success'
    | 'SP-API Jobs Failed';

type StatFilterConfig = {
    title: string;
    subtitle: string;
    status?: JobStatusFilter;
    jobNames?: readonly string[];
};

const KEEPA_JOB_NAMES = [
    'fetch-keepa-history-for-asin',
] as const;
const SP_API_JOB_NAMES = ['process-spapi-sync-queue'] as const;

export const STAT_FILTER_CONFIG: Record<AdminStatLabel, StatFilterConfig> = {
    'Keepa Fetches': {
        title: 'Recent Keepa Job Runs',
        subtitle: '100 most recent Keepa-related job executions',
        jobNames: KEEPA_JOB_NAMES,
    },
    'Job Successes': {
        title: 'Recent Successful Keepa Jobs',
        subtitle: '100 most recent successful Keepa job executions',
        status: 'success',
        jobNames: KEEPA_JOB_NAMES,
    },
    'Job Failures': {
        title: 'Recent Failed Keepa Jobs',
        subtitle: '100 most recent failed Keepa job executions',
        status: 'failed',
        jobNames: KEEPA_JOB_NAMES,
    },
    'SP-API Jobs Run': {
        title: 'Recent SP-API Job Runs',
        subtitle: '100 most recent SP-API job executions',
        jobNames: SP_API_JOB_NAMES,
    },
    'SP-API Jobs Success': {
        title: 'Recent Successful SP-API Jobs',
        subtitle: '100 most recent successful SP-API job executions',
        status: 'success',
        jobNames: SP_API_JOB_NAMES,
    },
    'SP-API Jobs Failed': {
        title: 'Recent Failed SP-API Jobs',
        subtitle: '100 most recent failed SP-API job executions',
        status: 'failed',
        jobNames: SP_API_JOB_NAMES,
    },
};

export const isStatFilterLabel = (label: string): label is AdminStatLabel => {
    return Object.prototype.hasOwnProperty.call(STAT_FILTER_CONFIG, label);
};
