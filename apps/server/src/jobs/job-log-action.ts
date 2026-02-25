const jobAliasByName: Record<string, { key: string; label: string }> = {
    'fetch-keepa-history-for-asin': {
        key: 'keepa-history-refresh',
        label: 'Keepa history refresh',
    },
    'process-keepa-history-refresh-queue': {
        key: 'keepa-refresh-dispatch',
        label: 'Keepa refresh dispatch',
    },
    'process-spapi-sync-queue': {
        key: 'product-sync',
        label: 'Product sync batch',
    },
    'reprocess-stale-products': {
        key: 'stale-product-reprocess',
        label: 'Stale product reprocess',
    },
};

export const getJobLogAction = (
    jobName: string,
    status: 'completed' | 'failed'
) => {
    return `job.${getJobAlias(jobName).key}.${status}`;
};

export const getJobLogLabel = (jobName: string) => {
    return getJobAlias(jobName).label;
};

const getJobAlias = (jobName: string) => {
    const knownAlias = jobAliasByName[jobName];
    if (knownAlias) {
        return knownAlias;
    }

    return {
        key: 'background-task',
        label: 'Background task',
    };
};
