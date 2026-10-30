import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { setAutomaticSyncPaused } from '@/db/automatic-sync';
import { brandAnalyticsSearchTerms } from '@/db/brand-analytics-schema';
import { registerBrandAnalyticsTrials } from '@/db/brand-analytics-trials';
import { catalogQueries } from '@/db/catalog-search-schema';
import { recordDiscoveryCandidates } from '@/db/discovery-candidates';
import { discoveryEvidence, discoveryTargets } from '@/db/discovery-target-schema';
import { db } from '@/db/index';
import { observeKeywordStanding } from '@/db/keyword-standing';
import {
    claimPrefixAutocomplete,
    finishPrefixAutocomplete,
    releasePrefixAutocomplete,
} from '@/db/keyword-prefix-autocomplete-work';
import { keywordPrefixes } from '@/db/keyword-prefix-schema';
import { backfillKeywordPrefixes } from '@/db/keyword-prefixes';
import { listDuePrefixAutocomplete } from '@/db/keyword-work-due';
import { products } from '@/db/product-schema';
import { expandPrefixAutocomplete } from '@/services/keyword-prefix-autocomplete';
import {
    discoveryNow as now,
    resetDiscoveryFixture,
    seedDiscoveryTarget,
} from './discovery-fixture';

const market = 'ATVPDKIKX0DER';
const prefixNames = async () =>
    (await db.select().from(keywordPrefixes)).map(row => row.prefix).sort();
const addTrial = (term: string) =>
    db.transaction(tx =>
        recordDiscoveryCandidates(tx, [
            {
                scope: { kind: 'keyword', term },
                evidence: { kind: 'brandAnalytics', sourceKey: 'week:2026-10-18', observedAt: now },
            },
        ])
    );
const addTerm = (
    normalizedTerm: string,
    rank: number,
    apparelClicks: number,
    prefix: string | null
) =>
    db.insert(brandAnalyticsSearchTerms).values({
        marketplaceId: market,
        normalizedTerm,
        searchFrequencyRank: rank,
        apparelClicks,
        merchProductText: apparelClicks === 0,
        prefix,
        clickedAsins: ['B0TST00001'],
        firstSeenWeek: '2026-10-18',
        lastSeenWeek: '2026-10-18',
    });

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword prefixes', () => {
    beforeEach(resetDiscoveryFixture);

    it('registers a prefix when a user tracks a keyword, once per prefix', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'teacher shirts for women' });
        await seedDiscoveryTarget({ kind: 'keyword', term: 'funny teacher mug' });
        await addTrial('nurse shirt');
        expect(await prefixNames()).toEqual(['teacher']);
        const [prefix] = await db.select().from(keywordPrefixes);
        expect(prefix).toMatchObject({ marketplaceId: market, stage: 'pending' });
        expect(prefix.firstQueryId).not.toBeNull();
    });

    it('registers a prefix when a trial graduates on its first page', async () => {
        await addTrial('pickleball dad shirt');
        const [target] = await db.select().from(discoveryTargets);
        const ids = await db
            .insert(products)
            .values(
                [1, 2, 3].map(i => ({
                    marketplaceId: market,
                    asin: `B0TST0000${i}`,
                    isMerchListing: true,
                    rootCategoryBsr: 90_000,
                    spApiFetchedAt: now,
                }))
            )
            .returning({ id: products.id });
        await db.transaction(tx =>
            observeKeywordStanding(tx, {
                target,
                productIds: ids.map(row => row.id),
                resultCount: 3,
                now,
            })
        );
        expect(await prefixNames()).toEqual(['pickleball dad']);
    });

    it('backfills prefixes from keywords tracked before prefixes existed', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'christmas mugs' });
        await seedDiscoveryTarget({ kind: 'keyword', term: 'mele kalikimaka sweatshirt' });
        await seedDiscoveryTarget({ kind: 'keyword', term: 'shirt' });
        await addTrial('nurse shirt');
        await db.delete(keywordPrefixes);
        expect(await backfillKeywordPrefixes(2, now)).toEqual({ scanned: 2, registered: 2 });
        expect(await backfillKeywordPrefixes(2, now)).toEqual({ scanned: 1, registered: 0 });
        // Caught up: it waits a day before looking again.
        expect(await backfillKeywordPrefixes(2, now)).toEqual({ scanned: 0, registered: 0 });
        expect(await prefixNames()).toEqual(['christmas', 'mele kalikimaka']);
    });

    it('expands a prefix once into product trials and waits while paused', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'teacher shirt' });
        // Prefixes registered by user tracking are due from the real clock.
        const later = new Date(Date.now() + 60_000);
        const [prefix] = await db.select().from(keywordPrefixes);
        expect((await listDuePrefixAutocomplete(later, 10)).map(row => row.id)).toEqual([
            prefix.id,
        ]);
        await setAutomaticSyncPaused(true, 'test');
        expect(await claimPrefixAutocomplete(later)).toBeNull();
        await setAutomaticSyncPaused(false, 'test');
        const result = await expandPrefixAutocomplete(prefix.id, {
            claim: (_at, id) => claimPrefixAutocomplete(later, id),
            suggest: async () => ['teacher gifts', 'teacher tumbler', 'teacher bags for women'],
            finish: (work, suggestions, trials) =>
                finishPrefixAutocomplete(work, suggestions, trials, later),
            release: releasePrefixAutocomplete,
        });
        expect(result).toMatchObject({ kind: 'complete', suggestions: 3, trials: 2 });
        const evidence = await db
            .select({ term: catalogQueries.normalizedTerm, kind: discoveryEvidence.kind })
            .from(discoveryEvidence)
            .innerJoin(discoveryTargets, eq(discoveryTargets.id, discoveryEvidence.targetId))
            .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
            .where(eq(discoveryEvidence.sourceKey, 'teacher'));
        expect(evidence.map(row => [row.term, row.kind]).sort()).toEqual([
            ['teacher bags for women', 'prefixAutocomplete'],
            ['teacher tumbler', 'prefixAutocomplete'],
        ]);
        const [expanded] = await db.select().from(keywordPrefixes);
        expect(expanded).toMatchObject({ stage: 'complete', trialCount: 2, claimToken: null });
        expect(await claimPrefixAutocomplete(later)).toBeNull();
        expect(await listDuePrefixAutocomplete(later, 10)).toHaveLength(0);
    });

    it('lists Brand Analytics product-text terms only once their prefix is registered', async () => {
        await addTerm('nurse shirt', 10, 1, 'nurse');
        await addTerm('teacher blanket', 20, 0, 'teacher');
        await addTerm('iphone 16 case', 5, 0, 'iphone 16');
        // Imported before prefixes were stored: never listed until a later import fills its prefix.
        await addTerm('teacher mug', 15, 0, null);
        expect(await registerBrandAnalyticsTrials(10, now)).toBe(1);
        expect(await registerBrandAnalyticsTrials(10, now)).toBe(0);
        await seedDiscoveryTarget({ kind: 'keyword', term: 'teacher shirt' });
        expect(await registerBrandAnalyticsTrials(10, now)).toBe(1);
        const registered = await db.execute<{ normalized_term: string }>(sql`
            select normalized_term from brand_analytics_search_terms
            where registered_at is not null order by normalized_term`);
        expect(registered.map(row => row.normalized_term)).toEqual([
            'nurse shirt',
            'teacher blanket',
        ]);
    });
});
