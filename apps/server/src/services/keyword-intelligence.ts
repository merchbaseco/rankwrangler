import { setTopSearchTermsDatasetQueued } from '@/db/top-search-terms/dataset-status.js';
import {
    ensureTopSearchTermsDataset,
    getLatestTopSearchTermsDataset,
    getTopSearchTermsDatasetById,
    getTopSearchTermsDatasetByWindow,
} from '@/db/top-search-terms/datasets.js';
import {
    getLatestTopSearchTermsSnapshotForDataset,
    getTopSearchTermsKeyword,
    listTopSearchTermsKeywords,
} from '@/db/top-search-terms/snapshots.js';
import { getTopSearchTermTrend } from '@/db/top-search-terms/trends.js';
import type {
    TopSearchTermsReportPeriod,
    TopSearchTermsWindow,
} from '@/db/top-search-terms/types.js';
import {
    buildEmptyKeywordSearchSummary,
    buildKeywordDatasetSummary,
    mapCurrentKeyword,
    mapSearchResult,
} from '@/services/keyword-intelligence-response.js';
import type {
    KeywordHistoryResponse,
    KeywordSearchResponse,
} from '@/services/keyword-intelligence-types.js';
import {
    awaitKeywordPerformanceRetrieval,
    buildKeywordPerformanceFreshness,
    type KeywordPerformanceRetrievalDeps,
} from '@/services/keyword-performance-retrieval.js';
import { getDefaultTopSearchTermsWindow } from '@/services/top-search-terms-dataset-windows.js';
import { sendFetchTopSearchTermsDatasetJob } from '@/services/top-search-terms-jobs.js';
import {
    calculateSearchTermsTrendDeltas,
    clampTrendRangeDays,
} from '@/services/top-search-terms-trend.js';
import { getPacificDateString } from '@/utils/date.js';

interface KeywordWindowInput {
    marketplaceId: string;
    reportPeriod: TopSearchTermsReportPeriod;
    dataStartDate?: string;
    dataEndDate?: string;
}

type KeywordReadInput = KeywordWindowInput & {
    refresh: boolean;
    signal?: AbortSignal;
};

export type KeywordDependencies = KeywordPerformanceRetrievalDeps & {
    getLatestDataset: typeof getLatestTopSearchTermsDataset;
    getDatasetByWindow: typeof getTopSearchTermsDatasetByWindow;
    getLatestSnapshot: typeof getLatestTopSearchTermsSnapshotForDataset;
    getKeyword: typeof getTopSearchTermsKeyword;
    listKeywords: typeof listTopSearchTermsKeywords;
    getTrend: typeof getTopSearchTermTrend;
};

const defaultDependencies: KeywordDependencies = {
    ensureDataset: ensureTopSearchTermsDataset,
    getDatasetById: getTopSearchTermsDatasetById,
    getLatestSnapshot: getLatestTopSearchTermsSnapshotForDataset,
    sendFetchJob: sendFetchTopSearchTermsDatasetJob,
    setDatasetQueued: setTopSearchTermsDatasetQueued,
    sleep: async delayMs => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
    },
    now: () => new Date(),
    workTimeoutMs: 5 * 60 * 1000,
    getLatestDataset: getLatestTopSearchTermsDataset,
    getDatasetByWindow: getTopSearchTermsDatasetByWindow,
    getKeyword: getTopSearchTermsKeyword,
    listKeywords: listTopSearchTermsKeywords,
    getTrend: getTopSearchTermTrend,
};

export const getKeywordIntelligence = async (
    input: { keyword: string } & KeywordReadInput,
    dependencies: KeywordDependencies = defaultDependencies
) => {
    const canonicalKeyword = normalizeKeyword(input.keyword);
    const context = await loadKeywordContext({
        category: 'keyword-performance',
        canonicalKeyword,
        input,
        dependencies,
    });
    if (!context.snapshot) {
        return {
            keyword: canonicalKeyword,
            status: 'empty' as const,
            current: null,
            freshness: context.freshness,
        };
    }

    const evidence = await dependencies.getKeyword({
        snapshotId: context.snapshot.id,
        searchTerm: canonicalKeyword,
    });
    return {
        keyword: canonicalKeyword,
        status: evidence ? ('ready' as const) : ('empty' as const),
        current: evidence ? mapCurrentKeyword(context.snapshot, evidence) : null,
        freshness: context.freshness,
    };
};

export const searchKeywordIntelligence = async (
    input: {
        text: string;
        cursor: number;
        limit: number;
        minRank?: number;
        maxRank?: number;
        merchOnly: boolean;
    } & KeywordReadInput,
    dependencies: KeywordDependencies = defaultDependencies
): Promise<KeywordSearchResponse> => {
    const canonicalKeyword = normalizeKeyword(input.text);
    const context = await loadKeywordContext({
        category: 'keyword-performance',
        canonicalKeyword,
        input,
        dependencies,
    });
    if (!(context.snapshot && context.dataset)) {
        return {
            status: 'empty',
            items: [],
            nextCursor: null,
            summary: buildEmptyKeywordSearchSummary(input),
            freshness: context.freshness,
        };
    }

    const { snapshot } = context;

    const listed = await dependencies.listKeywords({
        snapshotId: snapshot.id,
        cursor: input.cursor,
        limit: input.limit,
        maxRank: input.maxRank,
        merchOnly: input.merchOnly,
        minRank: input.minRank,
        search: canonicalKeyword,
    });

    return {
        status: listed.items.length > 0 ? 'ready' : 'empty',
        items: listed.items.map(row => mapSearchResult(snapshot, row)),
        nextCursor: listed.nextCursor,
        summary: buildKeywordDatasetSummary(snapshot, {
            totalFiltered: listed.totalFiltered,
        }),
        freshness: context.freshness,
    };
};

export const getKeywordHistory = async (
    input: {
        keyword: string;
        rangeDays: number;
    } & KeywordReadInput,
    dependencies: KeywordDependencies = defaultDependencies
): Promise<KeywordHistoryResponse> => {
    const canonicalKeyword = normalizeKeyword(input.keyword);
    const context = await loadKeywordContext({
        category: 'keyword-performance',
        canonicalKeyword,
        input,
        dependencies,
    });
    const rangeDays = clampTrendRangeDays(input.rangeDays);
    const result = await dependencies.getTrend({
        marketplaceId: input.marketplaceId,
        reportPeriod: input.reportPeriod,
        rangeDays,
        searchTerm: canonicalKeyword,
    });
    const points = result.points.map(point => ({
        observedDate: point.observedDate,
        searchFrequencyRank: point.searchFrequencyRank,
        clickShareTop3: point.clickShareTop3Sum,
        conversionShareTop3: point.conversionShareTop3Sum,
        trigger: point.trigger,
    }));

    return {
        keyword: canonicalKeyword,
        marketplaceId: input.marketplaceId,
        reportPeriod: input.reportPeriod,
        rangeDays,
        status: points.length > 0 ? 'ready' : 'empty',
        latestObservedDate: result.latestObservedDate,
        points,
        deltas: calculateSearchTermsTrendDeltas(result.points),
        freshness: context.freshness,
    };
};

const loadKeywordContext = async ({
    category,
    canonicalKeyword,
    input,
    dependencies,
}: {
    category: 'keyword-performance';
    canonicalKeyword: string;
    input: KeywordReadInput;
    dependencies: KeywordDependencies;
}) => {
    let context = await resolveKeywordContext(input, dependencies);
    if (!context.freshness.stale) {
        return context;
    }

    const retrievalInput = {
        category,
        canonicalKeyword,
        window: context.window,
        dataset: context.dataset,
        snapshot: context.snapshot,
        trigger:
            input.refresh || !context.snapshot ? ('requested' as const) : ('automatic' as const),
        signal: input.signal,
    };
    if (!context.snapshot || input.refresh) {
        await awaitKeywordPerformanceRetrieval(retrievalInput, dependencies);
        context = await resolveKeywordContext(input, dependencies);
        return context;
    }

    const backgroundRefresh = awaitKeywordPerformanceRetrieval(retrievalInput, dependencies);
    backgroundRefresh.catch(() => undefined);
    return context;
};

const resolveKeywordContext = async (
    input: KeywordWindowInput,
    dependencies: KeywordDependencies
) => {
    const window = resolveKeywordWindow(input);
    const hasExplicitWindow = Boolean(input.dataStartDate && input.dataEndDate);
    const dataset = hasExplicitWindow
        ? await dependencies.getDatasetByWindow(window)
        : await dependencies.getLatestDataset({
              marketplaceId: input.marketplaceId,
              reportPeriod: input.reportPeriod,
              status: 'completed',
          });
    const snapshot = dataset ? await dependencies.getLatestSnapshot(dataset.id) : null;
    return {
        dataset,
        snapshot,
        window,
        freshness: buildKeywordPerformanceFreshness(snapshot, dependencies.now()),
    };
};

const resolveKeywordWindow = (input: KeywordWindowInput): TopSearchTermsWindow => {
    if (input.dataStartDate && input.dataEndDate) {
        return {
            marketplaceId: input.marketplaceId,
            reportPeriod: input.reportPeriod,
            dataStartDate: input.dataStartDate,
            dataEndDate: input.dataEndDate,
        };
    }

    return getDefaultTopSearchTermsWindow({
        marketplaceId: input.marketplaceId,
        reportPeriod: input.reportPeriod,
        today: getPacificDateString(),
    });
};

const normalizeKeyword = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
