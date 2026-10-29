import { and, eq, inArray } from 'drizzle-orm';
import {
    keywordPopularity,
    nextKeywordStanding,
    nextKeywordTracking,
} from '@/services/keyword-standing-policy';
import { catalogQueries } from './catalog-search-schema';
import { discoveryTargets, keywordStandingObservations } from './discovery-target-schema';
import type { db } from './index';
import { writeKeywordEvents } from './keyword-events';
import { registerKeywordThemes } from './keyword-themes';
import { products } from './product-schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const observeKeywordStanding = async (
    tx: Transaction,
    input: {
        target: typeof discoveryTargets.$inferSelect;
        productIds: string[];
        resultCount: number;
        now: Date;
    }
) => {
    const { target, now } = input;
    const unordered = input.productIds.length
        ? await tx
              .select({
                  id: products.id,
                  rank: products.rootCategoryBsr,
                  fetchedAt: products.spApiFetchedAt,
              })
              .from(products)
              .where(
                  and(
                      inArray(products.id, input.productIds),
                      eq(products.isMerchListing, true),
                      eq(products.amazonListingStatus, 'active')
                  )
              )
        : [];
    // Head ids keep page-one search order so readers can show the shelf as Amazon ranked it.
    const position = new Map(input.productIds.map((id, index) => [id, index]));
    const rows = [...unordered].sort(
        (a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0)
    );
    const fresh = rows.filter(
        row => row.fetchedAt && now.getTime() - row.fetchedAt.getTime() <= 7 * 86_400_000
    );
    const [query] = await tx
        .select()
        .from(catalogQueries)
        .where(eq(catalogQueries.id, target.queryId));
    const calculated = keywordPopularity({
        ranks: fresh.map(row => row.rank),
        now,
    });
    const popularity = rows.length
        ? calculated
        : { ...calculated, score: 0, tier: 'cold' as const };
    const cadence = nextKeywordStanding({
        previousTier: target.standingTier,
        proposedTier: popularity.tier,
        intervalDays: target.intervalDays,
        previousIds: target.headProductIds,
        currentIds: rows.map(row => row.id),
        emptyCount: target.emptyCount,
        resultCount: input.resultCount,
        demotionObservedAt: target.demotionObservedAt,
        demotionCount: target.demotionCount,
        now,
    });
    const { tracking, trialFailures } = nextKeywordTracking({
        tracking: target.tracking,
        trialFailures: target.trialFailures,
        merchOnFirstPage: rows.length,
    });
    await tx
        .update(discoveryTargets)
        .set({
            tracking,
            enabled: tracking !== 'dormant',
            trialFailures,
            standingTier: cadence.tier,
            intervalDays: cadence.intervalDays,
            demotionCount: cadence.demotionCount,
            demotionObservedAt: cadence.demotionObservedAt,
            popularityScore: popularity.score ?? target.popularityScore,
            scoreComponents:
                popularity.score === null
                    ? target.scoreComponents
                    : {
                          best: popularity.best,
                          breadth: popularity.breadth,
                      },
            headProductIds: rows.map(row => row.id),
            headObservedAt: now,
            firstObservedAt: target.firstObservedAt ?? now,
            nextCheckAt: cadence.nextDueAt,
        })
        .where(eq(discoveryTargets.id, target.id));
    if (target.kind === 'keyword' && target.tracking !== 'tracked' && tracking === 'tracked')
        await registerKeywordThemes(
            tx,
            [{ queryId: query.id, term: query.normalizedTerm, marketplaceId: query.marketplaceId }],
            now
        );
    await tx.insert(keywordStandingObservations).values({
        targetId: target.id,
        queryId: target.queryId,
        observedAt: now,
        popularityScore: popularity.score ?? target.popularityScore,
        standingTier: cadence.tier,
        source: 'search',
    });
    if (tracking !== target.tracking || cadence.tier !== target.standingTier)
        await writeKeywordEvents(tx, [
            {
                id: target.queryId,
                term: query.normalizedTerm,
                action: 'keyword.standing.changed',
                occurredAt: now,
                details: {
                    previousTracking: target.tracking,
                    tracking,
                    previousTier: target.standingTier,
                    tier: cadence.tier,
                    score: popularity.score,
                    intervalDays: cadence.intervalDays,
                },
            },
        ]);
    return cadence.nextDueAt;
};
