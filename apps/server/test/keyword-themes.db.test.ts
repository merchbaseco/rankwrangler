import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { setAutomaticSyncPaused } from '@/db/automatic-sync';
import { readBrandAnalyticsStatus } from '@/db/brand-analytics-imports';
import { brandAnalyticsSearchTerms } from '@/db/brand-analytics-schema';
import { registerBrandAnalyticsTrials } from '@/db/brand-analytics-trials';
import { catalogQueries } from '@/db/catalog-search-schema';
import { recordDiscoveryCandidates } from '@/db/discovery-candidates';
import { discoveryEvidence, discoveryTargets } from '@/db/discovery-target-schema';
import { db } from '@/db/index';
import { observeKeywordStanding } from '@/db/keyword-standing';
import {
    claimThemeAutocomplete,
    finishThemeAutocomplete,
    releaseThemeAutocomplete,
} from '@/db/keyword-theme-autocomplete-work';
import { keywordThemes } from '@/db/keyword-theme-schema';
import { backfillKeywordThemes, readKeywordThemeCounts } from '@/db/keyword-themes';
import { listDueThemeAutocomplete } from '@/db/keyword-work-due';
import { products } from '@/db/product-schema';
import { expandThemeAutocomplete } from '@/services/keyword-theme-autocomplete';
import {
    discoveryNow as now,
    resetDiscoveryFixture,
    seedDiscoveryTarget,
} from './discovery-fixture';

const market = 'ATVPDKIKX0DER';
const themeNames = async () => (await db.select().from(keywordThemes)).map(row => row.theme).sort();
const addTrial = (term: string) =>
    db.transaction(tx =>
        recordDiscoveryCandidates(tx, [
            {
                scope: { kind: 'keyword', term },
                evidence: { kind: 'brandAnalytics', sourceKey: 'week:2026-10-18', observedAt: now },
            },
        ])
    );
const addTerm = (normalizedTerm: string, rank: number, apparelClicks: number, theme: string) =>
    db.insert(brandAnalyticsSearchTerms).values({
        marketplaceId: market,
        normalizedTerm,
        searchFrequencyRank: rank,
        apparelClicks,
        merchProductText: apparelClicks === 0,
        theme,
        clickedAsins: ['B0TST00001'],
        firstSeenWeek: '2026-10-18',
        lastSeenWeek: '2026-10-18',
    });

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword themes', () => {
    beforeEach(resetDiscoveryFixture);

    it('registers a theme when a user tracks a keyword, once per theme', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'teacher shirts for women' });
        await seedDiscoveryTarget({ kind: 'keyword', term: 'funny teacher mug' });
        await addTrial('nurse shirt');
        expect(await themeNames()).toEqual(['teacher']);
        const [theme] = await db.select().from(keywordThemes);
        expect(theme).toMatchObject({ marketplaceId: market, stage: 'pending' });
        expect(theme.firstQueryId).not.toBeNull();
    });

    it('registers a theme when a trial graduates on its first page', async () => {
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
        expect(await themeNames()).toEqual(['pickleball dad']);
    });

    it('backfills themes from keywords tracked before themes existed', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'christmas mugs' });
        await seedDiscoveryTarget({ kind: 'keyword', term: 'mele kalikimaka sweatshirt' });
        await seedDiscoveryTarget({ kind: 'keyword', term: 'shirt' });
        await addTrial('nurse shirt');
        await db.delete(keywordThemes);
        expect(await backfillKeywordThemes(2, now)).toEqual({ scanned: 2, registered: 2 });
        expect(await backfillKeywordThemes(2, now)).toEqual({ scanned: 1, registered: 0 });
        // Caught up: it waits a day before looking again.
        expect(await backfillKeywordThemes(2, now)).toEqual({ scanned: 0, registered: 0 });
        expect(await themeNames()).toEqual(['christmas', 'mele kalikimaka']);
    });

    it('expands a theme once into product trials and waits while paused', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'teacher shirt' });
        // Themes registered by user tracking are due from the real clock.
        const later = new Date(Date.now() + 60_000);
        const [theme] = await db.select().from(keywordThemes);
        expect((await listDueThemeAutocomplete(later, 10)).map(row => row.id)).toEqual([theme.id]);
        await setAutomaticSyncPaused(true, 'test');
        expect(await claimThemeAutocomplete(later)).toBeNull();
        await setAutomaticSyncPaused(false, 'test');
        const result = await expandThemeAutocomplete(theme.id, {
            claim: (_at, id) => claimThemeAutocomplete(later, id),
            suggest: async () => ['teacher gifts', 'teacher tumbler', 'teacher bags for women'],
            finish: (work, suggestions, trials) =>
                finishThemeAutocomplete(work, suggestions, trials, later),
            release: releaseThemeAutocomplete,
        });
        expect(result).toMatchObject({ kind: 'complete', suggestions: 3, trials: 2 });
        const evidence = await db
            .select({ term: catalogQueries.normalizedTerm, kind: discoveryEvidence.kind })
            .from(discoveryEvidence)
            .innerJoin(discoveryTargets, eq(discoveryTargets.id, discoveryEvidence.targetId))
            .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
            .where(eq(discoveryEvidence.sourceKey, 'teacher'));
        expect(evidence.map(row => [row.term, row.kind]).sort()).toEqual([
            ['teacher bags for women', 'themeAutocomplete'],
            ['teacher tumbler', 'themeAutocomplete'],
        ]);
        const [expanded] = await db.select().from(keywordThemes);
        expect(expanded).toMatchObject({ stage: 'complete', trialCount: 2, claimToken: null });
        expect(await claimThemeAutocomplete(later)).toBeNull();
        expect(await listDueThemeAutocomplete(later, 10)).toHaveLength(0);
    });

    it('lists Brand Analytics product-text terms only once their theme is registered', async () => {
        await addTerm('nurse shirt', 10, 1, 'nurse');
        await addTerm('teacher blanket', 20, 0, 'teacher');
        await addTerm('iphone 16 case', 5, 0, 'iphone 16');
        // The term and theme readers directly: the full jobs status also reads pg-boss queues,
        // which this suite never starts.
        expect((await readBrandAnalyticsStatus()).terms).toMatchObject({
            kept: 3,
            unregistered: 1,
            awaiting_theme: 2,
        });
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
        expect((await readBrandAnalyticsStatus()).terms).toMatchObject({
            unregistered: 0,
            awaiting_theme: 1,
        });
        expect(await readKeywordThemeCounts()).toEqual({ total: 1, expanded: 0, pending: 1 });
    });
});
