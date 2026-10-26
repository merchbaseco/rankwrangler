import { KEYWORD_DAY_MS, nextKeywordObservation } from './keyword-collection-policy';

export type StandingTier = 'unrated' | 'hot' | 'warm' | 'cold';
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
