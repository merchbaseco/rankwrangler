import { DAY_MS, HOUR_MS, shiftMs } from '@/dev-seed/time-offsets';
import type { BuilderContext, DevSeedPlan, PlanRows } from '@/dev-seed/types';
import { keywordPopularity } from '@/services/keyword-standing-policy';
import { getShortNameInputFingerprint } from '@/services/product-short-name-request';

/**
 * Keyword standing, membership, and score history over the seeded Search runs, plus stored short
 * names, so the Keywords and Product research reads render populated shelves, trends and names.
 *
 * Each Catalog query becomes a tracked keyword target whose head is its newest run's active
 * Merch Products in placement order, scored by the shipped popularity policy. Twelve weekly
 * observations walk toward that score so the trend and seven-day delta have a shape. Cutouts are
 * deliberately not seeded: a stored object key would point at an R2 asset that does not exist.
 */

const TREND_WEEKS = 12;
const SHORT_NAME_SHARE = 0.75;

export interface KeywordBuild {
    readonly discoveryTargets: DevSeedPlan['discoveryTargets'];
    readonly keywordProducts: DevSeedPlan['keywordProducts'];
    readonly keywordStandingObservations: DevSeedPlan['keywordStandingObservations'];
    readonly keywordExplorationPasses: DevSeedPlan['keywordExplorationPasses'];
    readonly keywordAutocomplete: DevSeedPlan['keywordAutocomplete'];
    readonly keywordDiscoveryAttempts: DevSeedPlan['keywordDiscoveryAttempts'];
    readonly productShortNames: DevSeedPlan['productShortNames'];
}

export const buildKeywords = (
    context: BuilderContext,
    catalog: Pick<DevSeedPlan, 'products'>,
    search: Pick<DevSeedPlan, 'catalogQueries' | 'catalogSearchRuns' | 'catalogSearchResults'>
): KeywordBuild => {
    const { random, mintId } = context;
    const productsById = new Map(catalog.products.map(product => [product.id, product]));
    const targets: PlanRows<'discoveryTargets'> = [];
    const memberships: PlanRows<'keywordProducts'> = [];
    const observations: PlanRows<'keywordStandingObservations'> = [];
    const passes: PlanRows<'keywordExplorationPasses'> = [];
    const attempts: PlanRows<'keywordDiscoveryAttempts'> = [];
    const autocomplete: PlanRows<'keywordAutocomplete'> = [];

    for (const query of search.catalogQueries) {
        const runs = search.catalogSearchRuns
            .filter(run => run.queryId === query.id)
            .sort((left, right) => time(left.sourceCompletedAt) - time(right.sourceCompletedAt));
        const latest = runs.at(-1);
        if (!latest) continue;
        const seen = new Map<string, { first: Date; last: Date }>();
        for (const run of runs) {
            for (const result of search.catalogSearchResults.filter(row => row.runId === run.id)) {
                const at = run.sourceCompletedAt as Date;
                seen.set(result.productId, {
                    first: seen.get(result.productId)?.first ?? at,
                    last: at,
                });
            }
        }
        for (const [productId, observed] of seen) {
            memberships.push({
                queryId: query.id as string,
                productId,
                firstObservedAt: observed.first,
                lastObservedAt: observed.last,
            });
        }
        const head = search.catalogSearchResults
            .filter(row => row.runId === latest.id)
            .sort((left, right) => left.sourcePosition - right.sourcePosition)
            .map(row => productsById.get(row.productId))
            .filter(
                product =>
                    product?.isMerchListing === true && product.amazonListingStatus !== 'deleted'
            );
        // Half the keywords had a page-one check in the last day, so mined-today is not empty.
        const observedAt =
            targets.length % 2 === 0
                ? shiftMs(context.now, -random.int(1, 20) * HOUR_MS)
                : (latest.sourceCompletedAt as Date);
        const popularity = keywordPopularity({
            ranks: head.map(product => product?.rootCategoryBsr ?? null),
            now: observedAt,
        });
        const score = popularity.score ?? 0;
        const tier = tierFor(score);
        const intervalDays = tier === 'hot' ? 2 : tier === 'warm' ? 10 : 35;
        const targetId = mintId('discoveryTarget');
        targets.push({
            id: targetId,
            queryId: query.id as string,
            kind: 'keyword',
            tracking: 'tracked',
            standingTier: tier,
            popularityScore: score,
            scoreComponents: { best: popularity.best, breadth: popularity.breadth },
            headProductIds: head.map(product => product?.id as string),
            headObservedAt: observedAt,
            firstObservedAt: runs[0].sourceCompletedAt as Date,
            // Two keywords are due so the queued count and status have something to show.
            nextCheckAt:
                targets.length < 2
                    ? shiftMs(context.now, -random.int(1, 6) * HOUR_MS)
                    : shiftMs(context.now, random.int(6, intervalDays * 24) * HOUR_MS),
            intervalDays,
            enabled: true,
            createdAt: query.createdAt as Date,
        });
        const passId = mintId('explorationPass');
        passes.push({
            id: passId,
            targetId,
            stopReason: 'sourceEnd',
            nextPage: 1,
            contiguousPages: 1,
            oldestPageAt: observedAt,
            lastPageAt: observedAt,
            resumeAt: targets.at(-1)?.nextCheckAt as Date,
            createdAt: observedAt,
            updatedAt: observedAt,
        });
        attempts.push({
            id: mintId('discoveryAttempt'),
            passId,
            attemptedAt: observedAt,
            page: 0,
            status: 'accepted',
            startedAt: observedAt,
            finishedAt: observedAt,
            resultCount: head.length,
            newProducts: 0,
            newMerchProducts: 0,
            knownMerch: head.length,
            unknownProducts: 0,
            nonMerchProducts: 0,
            newMerchMemberships: 0,
        });
        // Expansion already ran, so the directory status follows the page-one schedule.
        autocomplete.push({
            queryId: query.id as string,
            stage: 'complete',
            suggestions: [],
            suggestedAt: observedAt,
            completedAt: observedAt,
            nextDueAt: observedAt,
        });
        // Rising and falling keywords: the walk starts away from today's score and closes in.
        let walk = score - random.int(5, 45);
        for (let week = TREND_WEEKS - 1; week >= 0; week -= 1) {
            walk =
                week === 0 ? score : Math.round(walk + (score - walk) * 0.12 + random.int(-4, 4));
            const value = Math.max(0, Math.min(100, walk));
            observations.push({
                id: mintId('standingObservation'),
                targetId,
                queryId: query.id as string,
                observedAt: shiftMs(observedAt, -week * 7 * DAY_MS),
                popularityScore: value,
                standingTier: tierFor(value),
                source: week === 0 || week % 3 === 0 ? 'search' : 'storedRanks',
            });
        }
    }

    const shortNames: PlanRows<'productShortNames'> = catalog.products.flatMap(product => {
        const title = product.title;
        const imageUrl = product.thumbnailUrl;
        if (
            product.isMerchListing !== true ||
            !title ||
            !imageUrl ||
            !random.chance(SHORT_NAME_SHARE)
        )
            return [];
        const attemptedAt = shiftMs(context.now, -random.int(1, 20) * DAY_MS);
        return [
            {
                marketplaceId: product.marketplaceId,
                asin: product.asin,
                inputFingerprint: getShortNameInputFingerprint(title, imageUrl),
                state: 'ready' as const,
                shortName: shortNameFor(title),
                claimId: mintId('shortNameClaim'),
                attemptedAt,
                completedAt: attemptedAt,
            },
        ];
    });

    return {
        discoveryTargets: targets,
        keywordProducts: memberships,
        keywordStandingObservations: observations,
        keywordExplorationPasses: passes,
        keywordAutocomplete: autocomplete,
        keywordDiscoveryAttempts: attempts,
        productShortNames: shortNames,
    };
};

const time = (value: Date | undefined) => value?.getTime() ?? 0;

const tierFor = (score: number) =>
    score >= 75 ? ('hot' as const) : score >= 35 ? ('warm' as const) : ('cold' as const);

/** Seed titles end in a garment ("... T-Shirt"); the design name is what precedes it. */
const shortNameFor = (title: string) => {
    const words = title.split(/\s+/u).filter(Boolean);
    return words.slice(0, Math.max(1, Math.min(4, words.length - 1))).join(' ');
};
