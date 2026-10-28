import { KEYWORD_DAY_MS, nextKeywordObservation } from './keyword-collection-policy';

export type StandingTier = 'unrated' | 'hot' | 'warm' | 'cold';
export type KeywordTracking = 'trial' | 'tracked' | 'dormant';

// A trial graduates when its first page shows at least this many confirmed Merch listings. Three
// is a starting point, to be calibrated against real first-page scans.
export const MIN_MERCH_ON_FIRST_PAGE = 3;
// Trials whose first page shows too little Merch this many times go dormant.
export const TRIAL_FAILURE_LIMIT = 2;

// What a first-page head check means for a keyword's tracking. Tracked keywords stay tracked; a
// trial graduates on enough Merch and otherwise counts a failure toward dormancy.
export const nextKeywordTracking = (input: {
    tracking: KeywordTracking;
    trialFailures: number;
    merchOnFirstPage: number;
}) => {
    if (input.tracking !== 'trial') return { tracking: input.tracking, trialFailures: 0 };
    if (input.merchOnFirstPage >= MIN_MERCH_ON_FIRST_PAGE)
        return { tracking: 'tracked' as const, trialFailures: 0 };
    const trialFailures = input.trialFailures + 1;
    return {
        tracking: trialFailures >= TRIAL_FAILURE_LIMIT ? ('dormant' as const) : ('trial' as const),
        trialFailures,
    };
};
export const keywordPopularity = (input: { ranks: readonly (number | null)[]; now: Date }) => {
    const strengths = input.ranks
        .filter((rank): rank is number => rank !== null && rank > 0)
        .map(rank => Math.max(0, Math.min(1, Math.log10(1_000_000 / rank))))
        .sort((a, b) => b - a);
    if (!strengths.length) return { score: null, tier: 'unrated' as const, best: 0, breadth: 0 };
    const best = strengths[0];
    const breadth = strengths.slice(0, 5).reduce((sum, value) => sum + value, 0) / 5;
    const score = Math.round(Math.min(1, 0.4 * best + 0.6 * breadth) * 100);
    return {
        score,
        tier: score >= 75 ? ('hot' as const) : score >= 35 ? ('warm' as const) : ('cold' as const),
        best,
        breadth,
    };
};

export const nextKeywordStanding = (input: {
    previousTier: StandingTier;
    proposedTier: StandingTier;
    intervalDays: number;
    previousIds: readonly string[];
    currentIds: readonly string[];
    emptyCount: number;
    resultCount: number;
    demotionObservedAt: Date | null;
    demotionCount: number;
    now: Date;
    random?: () => number;
}) => {
    const order = { unrated: -1, cold: 0, warm: 1, hot: 2 };
    const lower =
        input.proposedTier !== 'unrated' && order[input.proposedTier] < order[input.previousTier];
    const demotionCount = lower ? input.demotionCount + 1 : 0;
    const demotionObservedAt = lower ? (input.demotionObservedAt ?? input.now) : null;
    const tier =
        input.proposedTier === 'unrated'
            ? input.previousTier
            : lower &&
                (demotionCount < 2 ||
                    !demotionObservedAt ||
                    input.now.getTime() - demotionObservedAt.getTime() < 14 * KEYWORD_DAY_MS)
              ? input.previousTier
              : input.proposedTier;
    const promoted = order[tier] > order[input.previousTier];
    const minimum = tier === 'hot' ? 1 : tier === 'cold' ? 30 : 7;
    const cadence = nextKeywordObservation({
        tier: tier === 'unrated' ? 'probation' : tier,
        intervalDays: promoted ? minimum : input.intervalDays,
        previousMerchIds: input.previousIds,
        currentMerchIds: input.currentIds,
        emptyCount: input.emptyCount,
        resultCount: input.resultCount,
        now: input.now,
        random: input.random,
    });
    return { tier, demotionCount, demotionObservedAt, ...cadence };
};
