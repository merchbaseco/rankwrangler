import type { TopSearchTermsDatasetRecord } from '@/db/top-search-terms/dataset-record.js';
import { setTopSearchTermsDatasetQueued } from '@/db/top-search-terms/dataset-status.js';
import {
    ensureTopSearchTermsDataset,
    getTopSearchTermsDatasetById,
} from '@/db/top-search-terms/datasets.js';
import {
    getLatestTopSearchTermsSnapshotForDataset,
    type TopSearchTermsSnapshotRecord,
} from '@/db/top-search-terms/snapshots.js';
import type {
    TopSearchTermsRefreshTrigger,
    TopSearchTermsWindow,
} from '@/db/top-search-terms/types.js';
import {
    coordinateRetrieval,
    RETRIEVAL_DEFAULT_CALLER_TIMEOUT_MS,
    RetrievalRetryableError,
} from '@/services/retrieval-coordinator.js';
import { sendFetchTopSearchTermsDatasetJob } from '@/services/top-search-terms-jobs.js';

export const KEYWORD_PERFORMANCE_FRESHNESS_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const KEYWORD_PERFORMANCE_WORK_TIMEOUT_MS = 5 * 60 * 1000;
export const KEYWORD_PERFORMANCE_RETRY_AFTER_SECONDS = 30 * 60;

const KEYWORD_PERFORMANCE_POLL_INTERVAL_MS = 2000;

export interface KeywordPerformanceRetrievalDeps {
    ensureDataset: typeof ensureTopSearchTermsDataset;
    getDatasetById: typeof getTopSearchTermsDatasetById;
    getLatestSnapshot: typeof getLatestTopSearchTermsSnapshotForDataset;
    sendFetchJob: typeof sendFetchTopSearchTermsDatasetJob;
    setDatasetQueued: typeof setTopSearchTermsDatasetQueued;
    sleep: (delayMs: number) => Promise<void>;
    now: () => Date;
    workTimeoutMs: number;
}

export interface KeywordPerformanceRetrievalInput {
    category: 'keyword-performance';
    canonicalKeyword: string;
    window: TopSearchTermsWindow;
    dataset: TopSearchTermsDatasetRecord | null;
    snapshot: TopSearchTermsSnapshotRecord | null;
    trigger: TopSearchTermsRefreshTrigger;
    signal?: AbortSignal;
    timeoutMs?: number;
}

const defaultDeps: KeywordPerformanceRetrievalDeps = {
    ensureDataset: ensureTopSearchTermsDataset,
    getDatasetById: getTopSearchTermsDatasetById,
    getLatestSnapshot: getLatestTopSearchTermsSnapshotForDataset,
    sendFetchJob: sendFetchTopSearchTermsDatasetJob,
    setDatasetQueued: setTopSearchTermsDatasetQueued,
    sleep: async delayMs => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
    },
    now: () => new Date(),
    workTimeoutMs: KEYWORD_PERFORMANCE_WORK_TIMEOUT_MS,
};

export const awaitKeywordPerformanceRetrieval = async (
    input: KeywordPerformanceRetrievalInput,
    deps: KeywordPerformanceRetrievalDeps = defaultDeps
) => {
    const key = [
        input.window.marketplaceId,
        input.window.reportPeriod,
        input.window.dataStartDate,
        input.window.dataEndDate,
        input.category,
        input.canonicalKeyword,
    ].join(':');

    return await coordinateRetrieval({
        key,
        signal: input.signal,
        timeoutMs: input.timeoutMs ?? RETRIEVAL_DEFAULT_CALLER_TIMEOUT_MS,
        retryAfterSeconds: KEYWORD_PERFORMANCE_RETRY_AFTER_SECONDS,
        retryMessage: 'Keyword performance is temporarily unavailable. Retry shortly.',
        work: async () => {
            const dataset =
                input.dataset ??
                (await deps.ensureDataset({
                    window: input.window,
                    nextRefreshAt: deps.now(),
                }));
            const baselineFetchedAt = input.snapshot?.fetchedAt ?? null;

            const cooldown = getDatasetCooldown(dataset, deps.now());
            if (cooldown) {
                throw new RetrievalRetryableError(
                    'Keyword performance is temporarily unavailable. Retry shortly.',
                    {
                        retryAfterSeconds: cooldown.retryAfterSeconds,
                        reason: 'capacity',
                    }
                );
            }

            if (!isDatasetWorkActive(dataset)) {
                const jobId = await deps.sendFetchJob({
                    datasetId: dataset.id,
                    trigger: input.trigger,
                });
                if (!jobId) {
                    const activeDataset = await deps.getDatasetById(dataset.id);
                    if (activeDataset && isDatasetWorkActive(activeDataset)) {
                        return await waitForKeywordPerformanceSnapshot(
                            {
                                baselineFetchedAt,
                                datasetId: activeDataset.id,
                            },
                            deps
                        );
                    }

                    throw new RetrievalRetryableError(
                        'Keyword performance is temporarily unavailable. Retry shortly.',
                        {
                            retryAfterSeconds: KEYWORD_PERFORMANCE_RETRY_AFTER_SECONDS,
                            reason: 'capacity',
                        }
                    );
                }

                await deps.setDatasetQueued({
                    datasetId: dataset.id,
                    jobId,
                    requestedAt: deps.now(),
                    trigger: input.trigger,
                });
            }

            return await waitForKeywordPerformanceSnapshot(
                {
                    baselineFetchedAt,
                    datasetId: dataset.id,
                },
                deps
            );
        },
    });
};

const waitForKeywordPerformanceSnapshot = async (
    {
        baselineFetchedAt,
        datasetId,
    }: {
        baselineFetchedAt: string | null;
        datasetId: string;
    },
    deps: KeywordPerformanceRetrievalDeps
) => {
    const deadline = deps.now().getTime() + deps.workTimeoutMs;
    while (deps.now().getTime() < deadline) {
        const [dataset, snapshot] = await Promise.all([
            deps.getDatasetById(datasetId),
            deps.getLatestSnapshot(datasetId),
        ]);

        if (snapshot && isPolicyFresh(snapshot.fetchedAt, baselineFetchedAt, deps.now())) {
            return { dataset, snapshot };
        }

        if (dataset?.status === 'failed') {
            throw new RetrievalRetryableError(
                'Keyword performance is temporarily unavailable. Retry shortly.',
                {
                    retryAfterSeconds: KEYWORD_PERFORMANCE_RETRY_AFTER_SECONDS,
                    reason: 'capacity',
                }
            );
        }

        await deps.sleep(KEYWORD_PERFORMANCE_POLL_INTERVAL_MS);
    }

    throw new RetrievalRetryableError(
        'Keyword performance is temporarily unavailable. Retry shortly.',
        {
            retryAfterSeconds: KEYWORD_PERFORMANCE_RETRY_AFTER_SECONDS,
            reason: 'deadline',
        }
    );
};

export const buildKeywordPerformanceFreshness = (
    snapshot: TopSearchTermsSnapshotRecord | null,
    now: Date
) => ({
    stale: !(snapshot && isPolicyFresh(snapshot.fetchedAt, null, now)),
    updatedAt: snapshot?.fetchedAt ?? null,
});

const isPolicyFresh = (fetchedAt: string, baselineFetchedAt: string | null, now: Date) => {
    const fetchedAtMs = Date.parse(fetchedAt);
    if (
        Number.isNaN(fetchedAtMs) ||
        now.getTime() - fetchedAtMs >= KEYWORD_PERFORMANCE_FRESHNESS_INTERVAL_MS
    ) {
        return false;
    }

    if (!baselineFetchedAt) {
        return true;
    }

    const baselineMs = Date.parse(baselineFetchedAt);
    return Number.isNaN(baselineMs) || fetchedAtMs > baselineMs;
};

const getDatasetCooldown = (dataset: TopSearchTermsDatasetRecord, now: Date) => {
    if (dataset.status !== 'failed' || !dataset.nextRefreshAt) {
        return null;
    }

    const nextRefreshAtMs = Date.parse(dataset.nextRefreshAt);
    if (Number.isNaN(nextRefreshAtMs) || nextRefreshAtMs <= now.getTime()) {
        return null;
    }

    return {
        retryAfterSeconds: Math.max(1, Math.ceil((nextRefreshAtMs - now.getTime()) / 1000)),
    };
};

const isDatasetWorkActive = (dataset: TopSearchTermsDatasetRecord) =>
    dataset.refreshing || dataset.status === 'queued' || dataset.status === 'in_progress';
