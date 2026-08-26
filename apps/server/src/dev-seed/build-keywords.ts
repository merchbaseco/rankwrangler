import { formatInTimeZone } from 'date-fns-tz';
import { classifyMerchKeyword } from '@/services/spapi/ba-keywords-aggregation';
import {
    buildDailyTopSearchTermsWindows,
    getDefaultTopSearchTermsWindow,
    getNextRefreshAtAfterSuccess,
} from '@/services/top-search-terms-dataset-windows';
import {
    SEED_AUDIENCES,
    SEED_BLOCKED_SEARCH_TERMS,
    SEED_GARMENTS,
    SEED_MERCH_SEARCH_TERMS,
} from '@/dev-seed/vocabulary';
import { DAY_MS, HOUR_MS, shiftMs } from '@/dev-seed/time-offsets';
import type { BuilderContext, DevSeedPlan, PlanRows } from '@/dev-seed/types';

/**
 * Brand Analytics Top Search Terms: one completed daily dataset per day of the
 * generated week plus the current weekly window, each with a snapshot and its
 * keyword rows.
 *
 * Two things make this worth generating rather than stubbing. The Keywords page
 * defaults to merch-only, so the rows are classified by the shipped
 * `classifyMerchKeyword` rather than by a flag chosen here — blocked terms are
 * blocked for the real reason and the filter demonstrably removes them. And the
 * trend columns compare a term against itself one, seven, and thirty days back,
 * so ranks drift across consecutive days instead of repeating.
 */

const PACIFIC_TIME_ZONE = 'America/Los_Angeles';
/** Enough consecutive days for the one-day and seven-day trend columns. */
const MIN_DAILY_WINDOWS = 9;
const KEYWORDS_PER_SNAPSHOT = 70;
const MAX_BASIS_POINTS = 10_000;

export interface KeywordsBuild {
    readonly topSearchTermsDatasets: DevSeedPlan['topSearchTermsDatasets'];
    readonly topSearchTermsSnapshots: DevSeedPlan['topSearchTermsSnapshots'];
    readonly topSearchTermsKeywordDaily: DevSeedPlan['topSearchTermsKeywordDaily'];
}

export const buildKeywords = (context: BuilderContext): KeywordsBuild => {
    const { random, now, marketplaceId, mintId, options } = context;
    const today = formatInTimeZone(now, PACIFIC_TIME_ZONE, 'yyyy-MM-dd');
    const dayCount = Math.max(MIN_DAILY_WINDOWS, options.dayCount);
    const windows = [
        ...buildDailyTopSearchTermsWindows({ marketplaceId, today, days: dayCount }),
        getDefaultTopSearchTermsWindow({ marketplaceId, reportPeriod: 'WEEK', today }),
    ];

    const terms = buildKeywordPool(context).slice(0, KEYWORDS_PER_SNAPSHOT);
    const datasets: PlanRows<'topSearchTermsDatasets'> = [];
    const snapshots: PlanRows<'topSearchTermsSnapshots'> = [];
    const keywords: PlanRows<'topSearchTermsKeywordDaily'> = [];

    windows.forEach((window, windowIndex) => {
        const datasetId = mintId('dataset');
        const snapshotId = mintId('snapshot');
        const reportId = `dev-seed-report-${window.reportPeriod.toLowerCase()}-${window.dataEndDate}`;
        const sourceJobId = `dev-seed-job-${windowIndex + 1}`;
        const fetchedAt = shiftMs(now, -(windowIndex + 1) * random.int(2, 5) * HOUR_MS);
        const dataset = {
            id: datasetId,
            marketplaceId,
            reportPeriod: window.reportPeriod,
            dataStartDate: window.dataStartDate,
            dataEndDate: window.dataEndDate,
            status: 'completed',
            refreshing: false,
            activeJobId: null,
            activeJobRequestedAt: null,
            fetchStartedAt: shiftMs(fetchedAt, -random.int(40, 300) * 1000),
            lastCompletedAt: fetchedAt,
            lastFailedAt: null,
            lastError: null,
            reportId,
            refreshTrigger: 'automatic' as const,
            nextRefreshAt: getNextRefreshAtAfterSuccess({ dataset: window, now, today }),
            createdAt: shiftMs(fetchedAt, -DAY_MS),
            updatedAt: fetchedAt,
        };
        datasets.push(dataset);

        snapshots.push({
            id: snapshotId,
            datasetId,
            marketplaceId,
            reportPeriod: window.reportPeriod,
            dataStartDate: window.dataStartDate,
            dataEndDate: window.dataEndDate,
            observedDate: window.dataEndDate,
            reportId,
            sourceJobId,
            trigger: 'automatic',
            keywordCount: terms.length,
            fetchedAt,
            createdAt: fetchedAt,
            updatedAt: fetchedAt,
        });

        // Day index counts backwards from today, so drift accumulates in the
        // direction the trend columns read it.
        const dayIndex = window.reportPeriod === 'DAY' ? windowIndex : 0;
        terms.forEach(term => {
            const rank = driftRank(term.baseRank, dayIndex, term.momentum);
            const clickShare = clampBasisPoints(
                term.baseClickShare + Math.round(term.momentum * dayIndex * -6)
            );
            keywords.push({
                id: mintId('keyword'),
                snapshotId,
                datasetId,
                marketplaceId,
                reportPeriod: window.reportPeriod,
                dataStartDate: window.dataStartDate,
                dataEndDate: window.dataEndDate,
                observedDate: window.dataEndDate,
                searchTerm: term.searchTerm,
                searchFrequencyRank: rank,
                clickShareTop3SumBasisPoints: clickShare,
                conversionShareTop3SumBasisPoints: clampBasisPoints(
                    Math.round(clickShare * random.between(0.35, 0.8))
                ),
                topRowsCount: random.int(1, 3),
                isMerchRelevant: term.isMerchRelevant,
                merchReason: term.merchReason,
                createdAt: fetchedAt,
            });
        });
    });

    return {
        topSearchTermsDatasets: datasets,
        topSearchTermsKeywordDaily: keywords,
        topSearchTermsSnapshots: snapshots,
    };
};

interface SeedKeyword {
    readonly baseClickShare: number;
    readonly baseRank: number;
    readonly isMerchRelevant: boolean;
    readonly merchReason: string;
    /** Positive climbs the rank list over the week, negative falls. */
    readonly momentum: number;
    readonly searchTerm: string;
}

/**
 * The pool deliberately mixes hand-written apparel terms, commodity and brand
 * terms, and generated audience/garment combinations, then labels every one of
 * them with the shipped classifier rather than by construction.
 */
const buildKeywordPool = (context: BuilderContext): SeedKeyword[] => {
    const { random } = context;
    const combos = SEED_AUDIENCES.flatMap(audience =>
        audience.nouns.map(
            noun => `${noun.toLowerCase()} ${random.pick(SEED_GARMENTS).toLowerCase()}`
        )
    );
    const unique = [
        ...new Set([...SEED_MERCH_SEARCH_TERMS, ...SEED_BLOCKED_SEARCH_TERMS, ...combos]),
    ];

    return random.shuffle(unique).map((searchTerm, index) => {
        const classification = classifyMerchKeyword(searchTerm);
        return {
            baseClickShare: random.int(120, 2600),
            // Ranks spread over a realistic Brand Analytics range, densest at
            // the head.
            baseRank: Math.round(600 + (index + 1) ** 2.1 * random.between(4, 9)),
            isMerchRelevant: classification.isMerchRelevant,
            merchReason: classification.merchReason,
            momentum: random.normal(),
            searchTerm,
        };
    });
};

const driftRank = (baseRank: number, dayIndex: number, momentum: number) =>
    Math.max(1, Math.round(baseRank * (1 + momentum * dayIndex * 0.035)));

const clampBasisPoints = (value: number) => Math.min(MAX_BASIS_POINTS, Math.max(0, value));
