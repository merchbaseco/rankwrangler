import { HOUR_MS, shiftMs } from '@/dev-seed/time-offsets';
import type { BuilderContext, DevSeedPlan, PlanRows } from '@/dev-seed/types';
import { bsrTierMax } from '@/services/bsr-tiers';
import { keywordPopularity } from '@/services/keyword-standing-policy';

/**
 * Two keywords the searched niches never produce, so the Keywords sidebar has something behind
 * every filter: a Cold keyword whose shelf is the catalog's slowest Merch, and a keyword with no
 * Merch yet that is mid-scan. Its page claim runs two hours past the seed time, long enough to
 * see Scanning in a dev session; a worker cannot reclaim it before then and nothing depends on it.
 */
const COLD_TERM = 'vintage lighthouse keeper shirt';
const SCANNING_TERM = 'retro bowling league shirt';
const SCANNING_CLAIM_MS = 2 * HOUR_MS;

export interface LongTailKeywordBuild {
    readonly catalogQueries: DevSeedPlan['catalogQueries'];
    readonly discoveryTargets: DevSeedPlan['discoveryTargets'];
    readonly keywordProducts: DevSeedPlan['keywordProducts'];
    readonly keywordExplorationPasses: DevSeedPlan['keywordExplorationPasses'];
    readonly keywordAutocomplete: DevSeedPlan['keywordAutocomplete'];
}

export const buildLongTailKeywords = (
    context: BuilderContext,
    catalog: Pick<DevSeedPlan, 'products'>
): LongTailKeywordBuild => {
    const { now, mintId, marketplaceId } = context;
    const slowest = catalog.products
        .filter(
            product =>
                product.isMerchListing === true &&
                product.amazonListingStatus !== 'deleted' &&
                (product.rootCategoryBsr ?? 0) > (bsrTierMax.steady as number)
        )
        .sort((left, right) => (right.rootCategoryBsr ?? 0) - (left.rootCategoryBsr ?? 0))
        .slice(0, 3);
    const queries: PlanRows<'catalogQueries'> = [];
    const targets: PlanRows<'discoveryTargets'> = [];
    const memberships: PlanRows<'keywordProducts'> = [];
    const passes: PlanRows<'keywordExplorationPasses'> = [];
    const autocomplete: PlanRows<'keywordAutocomplete'> = [];

    for (const term of [COLD_TERM, SCANNING_TERM]) {
        const scanning = term === SCANNING_TERM;
        const head = scanning ? [] : slowest;
        const queryId = mintId('catalogQuery');
        const createdAt = shiftMs(now, -30 * HOUR_MS);
        const observedAt = scanning ? null : shiftMs(now, -3 * HOUR_MS);
        const popularity = keywordPopularity({
            ranks: head.map(product => product.rootCategoryBsr ?? null),
            now,
        });
        queries.push({
            id: queryId,
            source: 'keepa',
            marketplaceId,
            normalizedTerm: term,
            displayTerm: term,
            lastRequestedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
        });
        const targetId = mintId('discoveryTarget');
        targets.push({
            id: targetId,
            queryId,
            kind: 'keyword',
            tracking: 'tracked',
            standingTier: popularity.tier,
            popularityScore: popularity.score,
            scoreComponents: { best: popularity.best, breadth: popularity.breadth },
            headProductIds: head.map(product => product.id as string),
            headObservedAt: observedAt,
            firstObservedAt: observedAt,
            nextCheckAt: scanning ? now : shiftMs(now, 20 * 24 * HOUR_MS),
            intervalDays: 35,
            enabled: true,
            createdAt,
        });
        for (const product of head) {
            memberships.push({
                queryId,
                productId: product.id as string,
                firstObservedAt: observedAt ?? now,
                lastObservedAt: observedAt ?? now,
            });
        }
        passes.push({
            id: mintId('explorationPass'),
            targetId,
            stopReason: scanning ? 'running' : 'sourceEnd',
            nextPage: scanning ? 0 : 1,
            contiguousPages: scanning ? 0 : 1,
            oldestPageAt: observedAt,
            lastPageAt: observedAt,
            claimAt: scanning ? shiftMs(now, SCANNING_CLAIM_MS) : null,
            claimToken: scanning ? mintId('explorationPass') : null,
            resumeAt: scanning ? now : shiftMs(now, 20 * 24 * HOUR_MS),
            createdAt: observedAt ?? now,
            updatedAt: observedAt ?? now,
        });
        autocomplete.push({
            queryId,
            stage: 'complete',
            suggestions: [],
            suggestedAt: createdAt,
            completedAt: createdAt,
            nextDueAt: createdAt,
        });
    }

    return {
        catalogQueries: queries,
        discoveryTargets: targets,
        keywordProducts: memberships,
        keywordExplorationPasses: passes,
        keywordAutocomplete: autocomplete,
    };
};
