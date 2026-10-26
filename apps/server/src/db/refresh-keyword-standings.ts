import { writeKeywordEvents } from './keyword-events';
import { and, eq, sql } from 'drizzle-orm';
import { keywordPopularity } from '@/services/keyword-standing-policy';
import { db } from './index';
import { catalogQueries } from './catalog-search-schema';
import { discoveryTargets, discoverySourceScans } from './discovery-target-schema';

export const refreshKeywordStandings = async (now = new Date()) =>
    db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('refresh-keyword-standings'))`);
        await tx
            .insert(discoverySourceScans)
            .values({ key: 'keyword-standing', nextDueAt: now })
            .onConflictDoNothing();
        const [scan] = await tx
            .select()
            .from(discoverySourceScans)
            .where(eq(discoverySourceScans.key, 'keyword-standing'))
            .for('update');
        if (scan.nextDueAt > now) return 0;
        const rows = await tx
            .select({
                target: discoveryTargets,
                query: catalogQueries,
                ranks: sql<(number | null)[]>`
        coalesce((select jsonb_agg(p.root_category_bsr) from products p
        where p.id in(select value::uuid from jsonb_array_elements_text(${discoveryTargets.headProductIds}))
        and p.is_merch_listing=true and p.amazon_listing_status='active'
        and p.sp_api_fetched_at>=${new Date(now.getTime() - 7 * 86_400_000).toISOString()}::timestamp),'[]'::jsonb)`,
            })
            .from(discoveryTargets)
            .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
            .where(
                and(
                    eq(discoveryTargets.kind, 'keyword'),
                    eq(discoveryTargets.enabled, true),
                    sql`${discoveryTargets.headObservedAt} is not null`,
                    scan.cursorCreatedAt && scan.cursorProductId
                        ? sql`(${discoveryTargets.createdAt},${discoveryTargets.id})>(${scan.cursorCreatedAt.toISOString()}::timestamp,${scan.cursorProductId}::uuid)`
                        : undefined
                )
            )
            .orderBy(discoveryTargets.createdAt, discoveryTargets.id)
            .limit(500);
        const order = { unrated: -1, cold: 0, warm: 1, hot: 2 };
        const updates = rows.flatMap(({ target, query, ranks }) => {
            const popularity = keywordPopularity({
                ranks,
                now,
            });
            if (popularity.score === null) return [];
            const promoted = order[popularity.tier] > order[target.standingTier];
            const interval = promoted
                ? popularity.tier === 'hot'
                    ? 1
                    : popularity.tier === 'warm'
                      ? 7
                      : 30
                : target.intervalDays;
            const due = promoted
                ? new Date(
                      Math.min(
                          target.nextCheckAt?.getTime() ?? Infinity,
                          Math.max(
                              now.getTime(),
                              target.headObservedAt!.getTime() + interval * 86_400_000
                          )
                      )
                  )
                : target.nextCheckAt;
            return [
                {
                    id: target.id,
                    score: popularity.score,
                    components: {
                        best: popularity.best,
                        breadth: popularity.breadth,
                    },
                    tier: promoted ? popularity.tier : target.standingTier,
                    interval,
                    next: due?.toISOString() ?? null,
                    expected_head: target.headObservedAt?.toISOString() ?? null,
                    expected_ids: target.headProductIds,
                    expected_tier: target.standingTier,
                    expected_interval: target.intervalDays,
                    expected_next: target.nextCheckAt?.toISOString() ?? null,
                },
            ];
        });
        if (updates.length) {
            const changed = await tx.execute<{
                query_id: string;
                tier: string;
                previous_tier: string;
                score: number;
                interval: number;
            }>(sql`with data as materialized (
        select * from jsonb_to_recordset(${JSON.stringify(updates)}::jsonb)
        as u(id uuid,score real,components jsonb,tier text,interval real,next timestamp,
            expected_head timestamp,expected_ids jsonb,expected_tier text,expected_interval real,expected_next timestamp)
    ), locked as materialized (
        select t.id from discovery_targets t join data u on u.id=t.id
        order by t.query_id,t.kind,t.scope_key for update of t
    ) update discovery_targets t set popularity_score=u.score,score_components=u.components,
        standing_tier=u.tier,interval_days=u.interval,next_check_at=u.next from data u join locked l on l.id=u.id
        where t.enabled and t.id=l.id and (t.head_observed_at,t.head_product_ids,t.standing_tier,t.interval_days,t.next_check_at)
            is not distinct from (u.expected_head,u.expected_ids,u.expected_tier,u.expected_interval,u.expected_next)
        and (t.popularity_score,t.score_components,t.standing_tier,t.interval_days,t.next_check_at)
            is distinct from (u.score,u.components,u.tier,u.interval,u.next)
        returning t.query_id,t.standing_tier tier,u.expected_tier previous_tier,t.popularity_score score,t.interval_days interval`);
            await writeKeywordEvents(
                tx,
                changed
                    .filter(row => row.tier !== row.previous_tier)
                    .map(row => ({
                        id: row.query_id,
                        term: rows.find(item => item.target.queryId === row.query_id)!.query
                            .normalizedTerm,
                        action: 'keyword.standing.changed',
                        occurredAt: now,
                        details: {
                            previousTier: row.previous_tier,
                            tier: row.tier,
                            score: row.score,
                            intervalDays: row.interval,
                            source: 'stored-ranks',
                        },
                    }))
            );
        }
        const last = rows.length === 500 ? rows.at(-1)?.target : null;
        await tx
            .update(discoverySourceScans)
            .set({
                cursorCreatedAt: last?.createdAt ?? null,
                cursorProductId: last?.id ?? null,
                nextDueAt: last ? now : new Date(now.getTime() + 3_600_000),
                updatedAt: now,
            })
            .where(eq(discoverySourceScans.key, 'keyword-standing'));
        return updates.length;
    });
