import type { PgBoss } from 'pg-boss';

export const FETCH_TOP_SEARCH_TERMS_DATASET_JOB_NAME = 'fetch-top-search-terms-dataset';
export const SYNC_TOP_SEARCH_TERMS_DATASETS_JOB_NAME = 'sync-top-search-terms-datasets';

let topSearchTermsBoss: PgBoss | null = null;

export const registerTopSearchTermsJobWakeups = (boss: PgBoss) => {
    topSearchTermsBoss = boss;
};

export const sendFetchTopSearchTermsDatasetJob = async ({
    datasetId,
}: {
    datasetId: string;
}): Promise<string | null> => {
    if (!topSearchTermsBoss) {
        throw new Error('Top Search Terms queue is not initialized.');
    }

    const jobId = await topSearchTermsBoss.send(
        FETCH_TOP_SEARCH_TERMS_DATASET_JOB_NAME,
        { datasetId },
        {
            retryLimit: 0,
            singletonKey: [FETCH_TOP_SEARCH_TERMS_DATASET_JOB_NAME, datasetId].join(':'),
        }
    );

    return jobId ?? null;
};

export const sendSyncTopSearchTermsDatasetsJob = async (): Promise<string | null> => {
    if (!topSearchTermsBoss) {
        throw new Error('Top Search Terms queue is not initialized.');
    }

    const jobId = await topSearchTermsBoss.send(
        SYNC_TOP_SEARCH_TERMS_DATASETS_JOB_NAME,
        {},
        {
            retryLimit: 0,
            singletonKey: SYNC_TOP_SEARCH_TERMS_DATASETS_JOB_NAME,
        }
    );

    return jobId ?? null;
};
