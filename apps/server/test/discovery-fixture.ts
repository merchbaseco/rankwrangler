import { and, eq, sql } from 'drizzle-orm';
import { recordDiscoveryCandidates } from '@/db/discovery-candidates';
import { checkpointDiscoveryPage } from '@/db/discovery-checkpoint';
import { discoveryTargets } from '@/db/discovery-target-schema';
import { claimKeywordExploration, reserveDiscoveryAttempt } from '@/db/discovery-work';
import { db } from '@/db/index';
import { observeCatalogCapacity, reserveCatalogCapacity } from '@/db/spapi-capacity';
import { spApiCatalogCapacity } from '@/db/spapi-capacity-schema';
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
    await db.execute(sql`truncate keyword_mining_capacity,keyword_prefixes,brand_analytics_search_terms,brand_analytics_imports,products,catalog_queries,discovery_source_scans,spapi_catalog_capacity,
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

export const claimDiscoveryFixture = async (now = discoveryNow) => {
    const work = await claimKeywordExploration(now);
    if (!work?.pass.claimToken) throw new Error('Missing discovery claim');
    return { ...work, claimToken: work.pass.claimToken };
};

export const primeCatalogCapacity = async (now = discoveryNow) => {
    await db
        .insert(spApiCatalogCapacity)
        .values({
            id: 1,
            tokens: 2,
            backgroundTokens: 1,
            effectiveRps: 1.6,
            observedRate: 2,
            observedAt: now,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: spApiCatalogCapacity.id,
            set: {
                tokens: 2,
                backgroundTokens: 1,
                observedRate: 2,
                observedAt: now,
                updatedAt: now,
                effectiveRps: 1.6,
            },
        });
};

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
    const decision = await reserveCatalogCapacity({
        priority: 'background',
        attemptId: id,
        protectedQueued: false,
        now,
    });
    if (decision.kind !== 'granted')
        throw new Error(`Unexpected capacity wait until ${decision.retryAt.toISOString()}`);
    await observeCatalogCapacity({
        attemptId: id,
        observedRate: 2,
        throttled: false,
        retryAfterMs: 0,
        failed: false,
        now,
    });
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
    fetchedAt: discoveryNow.toISOString(),
    ...extra,
});
