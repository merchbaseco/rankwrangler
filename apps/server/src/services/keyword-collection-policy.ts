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

export const explorationCheckpoint = ({
    page,
    nextPage,
    contiguousPages,
    lowYieldPages,
    newMerchCount,
    resultCount,
}: {
    page: number;
    nextPage: number;
    contiguousPages: number;
    lowYieldPages: number;
    newMerchCount: number;
    resultCount: number;
}) => {
    const frontier = Math.max(nextPage, page + 1);
    const quiet = newMerchCount < 3 ? lowYieldPages + 1 : 0;
    return {
        nextPage: frontier,
        contiguousPages: page === contiguousPages ? page + 1 : contiguousPages,
        lowYieldPages: quiet,
        stopReason:
            resultCount === 0 ? 'sourceEnd' : frontier >= 2 && quiet >= 2 ? 'lowYield' : 'running',
    };
};
