export const KEYWORD_DAY_MS = 86_400_000;
export type KeywordTier = 'probation' | 'hot' | 'warm' | 'cold' | 'stored';
const tierBounds = {
    probation: [7, 21],
    hot: [1, 7],
    warm: [7, 21],
    cold: [30, 60],
    stored: [30, 60],
} satisfies Record<KeywordTier, readonly [number, number]>;

export const nextKeywordObservation = ({
    tier,
    intervalDays,
    previousMerchIds,
    currentMerchIds,
    emptyCount,
    resultCount,
    now,
    random = Math.random,
}: {
    tier: KeywordTier;
    intervalDays: number;
    previousMerchIds: readonly string[];
    currentMerchIds: readonly string[];
    emptyCount: number;
    resultCount: number;
    now: Date;
    random?: () => number;
}) => {
    const previous = new Set(previousMerchIds);
    const retained = currentMerchIds.filter(id => previous.has(id)).length;
    const replaced = previous.size - retained;
    const changed = previous.size >= 3 && replaced >= 3 && retained / previous.size < 0.8;
    const [minimum, maximum] = tierBounds[tier];
    const consecutiveEmpty = resultCount === 0 ? emptyCount + 1 : 0;
    const nextInterval = consecutiveEmpty
        ? consecutiveEmpty === 1
            ? 7
            : 30
        : previous.size < 3
          ? Math.max(minimum, Math.min(maximum, intervalDays))
          : Math.max(minimum, Math.min(maximum, changed ? intervalDays / 2 : intervalDays * 1.5));
    return {
        intervalDays: Math.ceil(nextInterval),
        consecutiveEmpty,
        nextDueAt: new Date(now.getTime() + nextInterval * KEYWORD_DAY_MS * (0.9 + random() * 0.2)),
    };
};

export const keywordRetryAt = (failures: number, now: Date, retryAfterMs = 0) =>
    new Date(
        now.getTime() +
            Math.max(retryAfterMs, Math.min(KEYWORD_DAY_MS, 300_000 * 2 ** Math.min(failures, 9)))
    );

// A pass stops at this many pages even while pages keep finding new Merch; lowYield stops
// unproductive passes much earlier. Later checks start a new pass from the first page.
export const PASS_MAX_PAGES = 20;
// Popular Brand Analytics terms (top 100k) get a one-time deeper look even when page 1 is
// brand-heavy and drops the trial, and can re-trial when their weekly BA rank surges.
export const POPULAR_RANK_MAX = 100_000;
export const DROPPED_POPULAR_MAX_PAGES = 5;
export const SEASONAL_SURGE_MAX_RANK = POPULAR_RANK_MAX;
export const SEASONAL_SURGE_RANK_FACTOR = 2;
export const SEASONAL_SURGE_ABSENCE_DAYS = 60;
export const SEASONAL_SURGE_COOLDOWN_DAYS = 30;

export const isPopularBrandAnalyticsRank = (searchFrequencyRank: number | null) =>
    searchFrequencyRank !== null && searchFrequencyRank <= POPULAR_RANK_MAX;

export const passPageLimit = (
    tracking: 'trial' | 'tracked' | 'dropped' = 'tracked',
    searchFrequencyRank: number | null = null
) =>
    tracking === 'dropped'
        ? isPopularBrandAnalyticsRank(searchFrequencyRank)
            ? DROPPED_POPULAR_MAX_PAGES
            : 1
        : PASS_MAX_PAGES;

export const isBrandAnalyticsRankSurge = ({
    previousRank,
    newRank,
    previousWeek,
    newWeek,
}: {
    previousRank: number;
    newRank: number;
    previousWeek: string;
    newWeek: string;
}) => {
    if (newRank > SEASONAL_SURGE_MAX_RANK || newWeek <= previousWeek) return false;
    if (newRank * SEASONAL_SURGE_RANK_FACTOR <= previousRank) return true;
    const gapDays = (Date.parse(newWeek) - Date.parse(previousWeek)) / KEYWORD_DAY_MS;
    return Number.isFinite(gapDays) && gapDays >= SEASONAL_SURGE_ABSENCE_DAYS;
};

// newMerchCount is Merch new to the whole catalog on this page: once a niche's products are
// already stored, deeper pages stop paying for themselves even if they are new to this keyword.
export const explorationCheckpoint = ({
    page,
    nextPage,
    contiguousPages,
    lowYieldPages,
    newMerchCount,
    resultCount,
    pageLimit = PASS_MAX_PAGES,
}: {
    page: number;
    nextPage: number;
    contiguousPages: number;
    lowYieldPages: number;
    newMerchCount: number;
    resultCount: number;
    pageLimit?: number;
}) => {
    const frontier = Math.max(nextPage, page + 1);
    const quiet = newMerchCount < 3 ? lowYieldPages + 1 : 0;
    return {
        nextPage: frontier,
        contiguousPages: page === contiguousPages ? page + 1 : contiguousPages,
        lowYieldPages: quiet,
        stopReason:
            resultCount === 0
                ? 'sourceEnd'
                : frontier >= 2 && quiet >= 2
                  ? 'lowYield'
                  : frontier >= pageLimit
                    ? 'pageLimit'
                    : 'running',
    };
};
