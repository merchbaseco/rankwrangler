import { sql } from 'drizzle-orm';
import {
    CATALOG_BACKGROUND_SHARE,
    catalogCapacityBalance,
} from '@/services/catalog-capacity-policy';
import { db } from './index';
import { readCatalogCapacity } from './spapi-capacity';

export const readDiscoveryStatus = async () => {
    const [state, scopes, sources, yields, [brandAnalytics], standings] = await Promise.all([
        readCatalogCapacity(),
        db.execute<{ kind: string; targets: number; enabled: number }>(sql`
            select kind,count(*)::int targets,count(*) filter(where enabled)::int enabled
            from discovery_targets group by kind order by kind`),
        db.execute<{ kind: string; targets: number }>(sql`
            select e.kind,count(distinct e.target_id)::int targets from discovery_evidence e
            join discovery_targets t on t.id=e.target_id
            where e.eligible and t.enabled group by e.kind order by e.kind`),
        db.execute<{
            measured_pages: number;
            legacy_pages: number;
            products: number;
            new_products: number;
            new_merch: number;
            merch: number;
            unknown: number;
            non_merch: number;
            physical_starts: number;
        }>(sql`
            select count(*) filter(where status='accepted' and result_count is not null)::int measured_pages,
                count(*) filter(where status='accepted' and result_count is null)::int legacy_pages,
                coalesce(sum(result_count) filter(where status='accepted'),0)::int products,
                coalesce(sum(new_products) filter(where status='accepted'),0)::int new_products,
                coalesce(sum(new_merch_products) filter(where status='accepted'),0)::int new_merch,
                coalesce(sum(known_merch) filter(where status='accepted'),0)::int merch,
                coalesce(sum(unknown_products) filter(where status='accepted'),0)::int unknown,
                coalesce(sum(non_merch_products) filter(where status='accepted'),0)::int non_merch,
                count(*) filter(where started_at is not null)::int physical_starts
            from keyword_discovery_attempts where attempted_at>timezone('UTC',now())-interval '24 hours'`),
        db.execute<{ kept: number; registered: number }>(sql`
            select count(*)::int kept,count(*) filter(where registered_at is not null)::int registered
            from brand_analytics_search_terms`),
        db.execute<{
            keyword: string;
            tracking: string;
            tier: string;
            score: number | null;
            interval_days: number;
            next_check_at: Date | null;
        }>(sql`
            select q.display_term keyword,t.tracking,t.standing_tier tier,t.popularity_score score,t.interval_days,t.next_check_at
            from discovery_targets t join catalog_queries q on q.id=t.query_id where t.kind='keyword' and t.enabled
            order by t.popularity_score desc nulls last,q.normalized_term limit 20`),
    ]);
    const counts = yields[0];
    if (!counts) throw new Error('Discovery yield aggregate returned no row');
    const balance = state ? catalogCapacityBalance(state, new Date()) : null;
    return {
        brandAnalytics: brandAnalytics ?? { kept: 0, registered: 0 },
        standings: [...standings],
        scopes: [...scopes],
        sources: [...sources],
        yield24h: counts,
        capacity:
            state && balance
                ? {
                      observedAt: state.observedAt,
                      observedRps: state.observedRate,
                      effectiveRps: balance.rps,
                      backgroundRps: balance.backgroundRps,
                      backgroundShare: CATALOG_BACKGROUND_SHARE,
                      cooldownUntil: state.cooldownUntil,
                      backgroundPausedUntil: state.backgroundPausedUntil,
                      foregroundStarts: state.foregroundStarts,
                      backgroundStarts: state.backgroundStarts,
                  }
                : null,
    };
};
