import { lockKeywordScheduling } from './keyword-scheduling-lock';
import { lockCatalogQueryForReconciliation } from './catalog-query-resolution';
import { getKeepaAdmissionCapacity } from '@/services/keepa-capacity';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from './index';
import { catalogQueries } from './catalog-search-schema';
import { topSearchTermsKeywordDaily, topSearchTermsSnapshots } from './top-search-terms-schema';
import { KEYWORD_DAY_MS } from '@/services/keyword-collection-policy';

export const refreshKeywordDemand = async (now = new Date()) => {
    const [snapshot] = await db
        .select({ id: topSearchTermsSnapshots.id, fetchedAt: topSearchTermsSnapshots.fetchedAt })
        .from(topSearchTermsSnapshots)
        .where(
            and(
                eq(topSearchTermsSnapshots.marketplaceId, 'ATVPDKIKX0DER'),
                eq(topSearchTermsSnapshots.reportPeriod, 'DAY'),
                sql`${topSearchTermsSnapshots.dataEndDate} >= ${new Date(now.getTime() - 7 * KEYWORD_DAY_MS).toISOString().slice(0, 10)}`,
                gt(topSearchTermsSnapshots.fetchedAt, new Date(now.getTime() - 7 * KEYWORD_DAY_MS))
            )
        )
        .orderBy(
            sql`${topSearchTermsSnapshots.dataEndDate} desc`,
            sql`${topSearchTermsSnapshots.fetchedAt} desc`
        )
        .limit(1);
    if (!snapshot) return;
    const seedTerms = await db
        .select({ term: topSearchTermsKeywordDaily.searchTerm })
        .from(topSearchTermsKeywordDaily)
        .where(
            and(
                eq(topSearchTermsKeywordDaily.snapshotId, snapshot.id),
                eq(topSearchTermsKeywordDaily.isMerchRelevant, true)
            )
        )
        .orderBy(topSearchTermsKeywordDaily.searchFrequencyRank)
        .limit(20);
    const seeds = seedTerms
        .map(({ term }) => term.trim().replace(/\s+/g, ' '))
        .filter(term => term.length > 0 && term.length <= 200)
        .map(displayTerm => ({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            displayTerm,
            normalizedTerm: displayTerm.toLowerCase(),
            admissionReason: 'brandAnalytics',
        }));
    if (seeds.length) await db.insert(catalogQueries).values(seeds).onConflictDoNothing();

    const ranked = db
        .select({
            term: topSearchTermsKeywordDaily.searchTerm,
            percentile:
                sql<number>`(percent_rank() over (order by ${topSearchTermsKeywordDaily.searchFrequencyRank}) * 100)::int`.as(
                    'percentile'
                ),
            sample: sql<number>`count(*) over ()::int`.as('sample'),
        })
        .from(topSearchTermsKeywordDaily)
        .where(
            and(
                eq(topSearchTermsKeywordDaily.snapshotId, snapshot.id),
                eq(topSearchTermsKeywordDaily.isMerchRelevant, true)
            )
        )
        .as('ranked');
    return await db.transaction(async tx => {
        await lockKeywordScheduling(tx);
        const evidence = await tx
            .select({ query: catalogQueries, percentile: ranked.percentile, sample: ranked.sample })
            .from(catalogQueries)
            .innerJoin(
                ranked,
                sql`lower(regexp_replace(trim(${ranked.term}), '[[:space:]]+', ' ', 'g')) = ${catalogQueries.normalizedTerm}`
            )
            .where(
                sql`${catalogQueries.demandObservedAt} is null or ${catalogQueries.demandObservedAt} < ${snapshot.fetchedAt.toISOString()}::timestamp`
            );
        const capacity = await getKeepaAdmissionCapacity(tx);
        const [load] = capacity
            ? await tx
                  .select({
                      daily: sql<number>`coalesce(sum(${capacity.headCost}::numeric / greatest(${catalogQueries.intervalDays}, 1)), 0)::float`,
                  })
                  .from(catalogQueries)
                  .where(sql`${catalogQueries.tier} <> 'stored'`)
            : [];
        let forecast = load?.daily ?? 0;
        for (const row of evidence) {
            if (row.sample < 30) continue;
            await lockCatalogQueryForReconciliation(tx, row.query.id);
            const [query] = await tx
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.id, row.query.id));
            if (!query) continue;
            const tier = row.percentile < 10 ? 'hot' : row.percentile < 50 ? 'warm' : 'cold';
            const leased = Boolean(query.activeUntil && query.activeUntil > now);
            const ordering = { stored: 0, cold: 1, probation: 2, warm: 2, hot: 3 };
            const oldOrder = ordering[query.tier as keyof typeof ordering];
            const isDemotion = ordering[tier] < oldOrder;
            const demotionObservedAt = isDemotion ? (query.demotionObservedAt ?? now) : null;
            const demotionCount = isDemotion ? query.demotionCount : 0;
            const canDemote =
                demotionCount >= 2 &&
                demotionObservedAt &&
                now.getTime() - demotionObservedAt.getTime() >= 14 * KEYWORD_DAY_MS;
            let canChange =
                query.tier !== 'stored' &&
                query.merchObservedAt &&
                !leased &&
                (!isDemotion || canDemote);
            const intervalDays = tier === 'hot' ? 1 : tier === 'warm' ? 7 : 30;
            if (canChange) {
                const extra = capacity
                    ? capacity.headCost / intervalDays - capacity.headCost / query.intervalDays
                    : Number.POSITIVE_INFINITY;
                if (
                    !isDemotion &&
                    (!capacity || forecast + extra > capacity.refillRate * 1440 * 0.2 * 0.9)
                )
                    canChange = false;
                else forecast += extra;
            }

            await tx
                .update(catalogQueries)
                .set({
                    demandPercentile: row.percentile,
                    demandObservedAt: snapshot.fetchedAt,
                    demotionObservedAt,
                    demotionCount,
                    ...(canChange
                        ? {
                              tier,
                              intervalDays,
                              nextDueAt: new Date(
                                  Math.max(
                                      now.getTime(),
                                      (query.latestSuccessfulRunAt?.getTime() ?? 0) +
                                          intervalDays * KEYWORD_DAY_MS
                                  )
                              ),
                          }
                        : {}),
                })
                .where(eq(catalogQueries.id, query.id));
        }
    });
};
