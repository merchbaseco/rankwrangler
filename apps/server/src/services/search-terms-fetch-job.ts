import type { PgBoss } from 'pg-boss';
import type { SearchTermsWindow } from '@/db/search-terms/fetch-status.js';

export const FETCH_SEARCH_TERMS_JOB_NAME = 'fetch-search-terms-report';

let searchTermsFetchBoss: PgBoss | null = null;

export const registerSearchTermsFetchWakeups = (boss: PgBoss) => {
    searchTermsFetchBoss = boss;
};

export const sendFetchSearchTermsJob = async (
    input: SearchTermsWindow
): Promise<string | null> => {
    if (!searchTermsFetchBoss) {
        throw new Error('Search Terms fetch queue is not initialized.');
    }

    const jobId = await searchTermsFetchBoss.send(
        FETCH_SEARCH_TERMS_JOB_NAME,
        input,
        {
            retryLimit: 0,
            singletonKey: buildSearchTermsFetchSingletonKey(input),
        }
    );

    return jobId ?? null;
};

const buildSearchTermsFetchSingletonKey = (input: SearchTermsWindow) => {
    return [
        FETCH_SEARCH_TERMS_JOB_NAME,
        input.marketplaceId,
        input.reportPeriod,
        input.dataStartDate,
        input.dataEndDate,
    ].join(':');
};
