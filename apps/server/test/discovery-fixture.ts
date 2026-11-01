import { and, eq, sql } from 'drizzle-orm';
import { recordDiscoveryCandidates } from '@/db/discovery-candidates';
import { checkpointDiscoveryPage } from '@/db/discovery-checkpoint';
import { discoveryTargets } from '@/db/discovery-target-schema';
import { claimKeywordExploration, reserveDiscoveryAttempt } from '@/db/discovery-work';
import { db } from '@/db/index';
import { catalogQueries } from '@/db/catalog-search-schema';
import type { DiscoveryScope } from '@/services/discovery-types';
import { persistDiscoveredSpApiProducts } from '@/services/spapi-keyword-discovery';
import type { SpApiProduct } from '@/types';

export const discoveryNow = new Date('2026-10-25T12:00:00Z');
export const resetDiscoveryFixture = async () => {
    if (
        process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
        process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
    ) {
        throw new Error('Discovery proof requires the private loopback database');
    }
    await db.execute(sql`truncate keyword_mining_capacity,keyword_prefixes,brand_analytics_search_terms,brand_analytics_imports,products,catalog_queries,discovery_source_scans,
        official_brands,keepa_capacity_state,keepa_capacity_attempts,operations cascade`);
};

export const seedDiscoveryTarget = async (scope: DiscoveryScope, now = discoveryNow) => {
    await db.transaction(tx =>
        recordDiscoveryCandidates(tx, [
            { scope, evidence: { kind: 'interest', sourceKey: 'request', observedAt: now } },
        ])
    );
    const [target] = await db
        .select({ target: discoveryTargets })
        .from(discoveryTargets)
        .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
        .where(
            and(
                eq(catalogQueries.normalizedTerm, scope.term.toLowerCase()),
                eq(discoveryTargets.kind, scope.kind),
                scope.kind === 'brand'
                    ? eq(discoveryTargets.scopeKey, scope.brandName.toLowerCase())
                    : undefined
            )
        );
    if (!target) throw new Error('Missing seeded discovery target');
    return target.target;
};

// Claims the named target, or the only target when the test seeded one.
export const claimDiscoveryFixture = async (now = discoveryNow, targetId?: string) => {
    const id = targetId ?? (await onlyTargetId());
    const work = await claimKeywordExploration(id, now);
    if (!work?.pass.claimToken) throw new Error('Missing discovery claim');
    return { ...work, claimToken: work.pass.claimToken };
};

// The started page attempt a scan job holds while its request is in flight.
export const fetchDiscoveryReceipt = async (
    work: Awaited<ReturnType<typeof claimDiscoveryFixture>>,
    now = discoveryNow
) => {
    const id = await reserveDiscoveryAttempt({
        passId: work.pass.id,
        claimToken: work.claimToken,
        page: work.pass.nextPage,
        now,
    });
    if (!id) throw new Error('Missing discovery receipt');
    return id;
};

export const acceptDiscoveryFixture = async (
    work: Awaited<ReturnType<typeof claimDiscoveryFixture>>,
    products: SpApiProduct[],
    now = discoveryNow,
    nextPageToken: string | null = 'next-page'
) => {
    const attemptId = await fetchDiscoveryReceipt(work, now);
    const pass = await checkpointDiscoveryPage({
        passId: work.pass.id,
        claimToken: work.claimToken,
        attemptId,
        page: work.pass.nextPage,
        nextPageToken,
        observedAt: now,
        products,
        persist: persistDiscoveredSpApiProducts,
    });
    return { pass, attemptId };
};

export const discoveryProduct = (
    asin: string,
    extra: Partial<SpApiProduct> = {}
): SpApiProduct => ({
    asin,
    marketplaceId: 'ATVPDKIKX0DER',
    dateFirstAvailable: null,
    title: 'Fishing shirt',
    brand: 'Independent Studio',
    isMerchListing: true,
    bullet1: null,
    bullet2: null,
    rootCategoryId: null,
    rootCategoryBsr: 200_000,
    thumbnailUrl: null,
    keepa: null,
    parentAsin: null,
    childAsin: null,
    fetchedAt: discoveryNow.toISOString(),
    ...extra,
});

const onlyTargetId = async () => {
    const targets = await db.select({ id: discoveryTargets.id }).from(discoveryTargets);
    if (targets.length !== 1) throw new Error('Name the target to claim among several');
    return targets[0].id;
};
