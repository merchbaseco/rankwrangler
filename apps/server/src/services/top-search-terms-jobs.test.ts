import { describe, expect, it, mock } from 'bun:test';
import type { PgBoss } from 'pg-boss';
import {
    FETCH_TOP_SEARCH_TERMS_DATASET_JOB_NAME,
    getTopSearchTermsFetchStaleActiveJobCutoff,
    registerTopSearchTermsJobWakeups,
    sendFetchTopSearchTermsDatasetJob,
    sendSyncTopSearchTermsDatasetsJob,
    SYNC_TOP_SEARCH_TERMS_DATASETS_JOB_NAME,
    TOP_SEARCH_TERMS_FETCH_EXPIRE_IN_SECONDS,
    TOP_SEARCH_TERMS_FETCH_GROUP_ID,
} from '@/services/top-search-terms-jobs.js';

describe('sendFetchTopSearchTermsDatasetJob', () => {
    it('sends dataset fetch jobs in a shared BA fetch group', async () => {
        const send = mock(async () => 'job-id');
        registerTopSearchTermsJobWakeups({ send } as unknown as PgBoss);

        const datasetId = 'b101f8a9-0a95-4cf0-b71e-a0e0219ac006';
        const jobId = await sendFetchTopSearchTermsDatasetJob({ datasetId });

        expect(jobId).toBe('job-id');
        expect(send.mock.calls).toHaveLength(1);
        expect(send.mock.calls[0]).toEqual([
            FETCH_TOP_SEARCH_TERMS_DATASET_JOB_NAME,
            { datasetId },
            {
                expireInSeconds: TOP_SEARCH_TERMS_FETCH_EXPIRE_IN_SECONDS,
                group: {
                    id: TOP_SEARCH_TERMS_FETCH_GROUP_ID,
                },
                retryLimit: 0,
                singletonKey: `${FETCH_TOP_SEARCH_TERMS_DATASET_JOB_NAME}:${datasetId}`,
            },
        ]);
    });

    it('returns null when pg-boss does not enqueue a job', async () => {
        const send = mock(async () => null);
        registerTopSearchTermsJobWakeups({ send } as unknown as PgBoss);

        const jobId = await sendFetchTopSearchTermsDatasetJob({
            datasetId: 'b101f8a9-0a95-4cf0-b71e-a0e0219ac006',
        });

        expect(jobId).toBeNull();
    });
});

describe('sendSyncTopSearchTermsDatasetsJob', () => {
    it('uses a singleton key so only one sync wakeup is queued', async () => {
        const send = mock(async () => 'sync-job-id');
        registerTopSearchTermsJobWakeups({ send } as unknown as PgBoss);

        const jobId = await sendSyncTopSearchTermsDatasetsJob();

        expect(jobId).toBe('sync-job-id');
        expect(send.mock.calls).toHaveLength(1);
        expect(send.mock.calls[0]).toEqual([
            SYNC_TOP_SEARCH_TERMS_DATASETS_JOB_NAME,
            {},
            {
                retryLimit: 0,
                singletonKey: SYNC_TOP_SEARCH_TERMS_DATASETS_JOB_NAME,
            },
        ]);
    });
});

describe('getTopSearchTermsFetchStaleActiveJobCutoff', () => {
    it('marks active jobs stale after expiry plus grace period', () => {
        const now = new Date('2026-03-04T17:30:00.000Z');
        const cutoff = getTopSearchTermsFetchStaleActiveJobCutoff(now);

        expect(cutoff.toISOString()).toBe('2026-03-04T17:10:00.000Z');
    });
});
