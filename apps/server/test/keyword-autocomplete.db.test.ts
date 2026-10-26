import { beforeEach, describe, it, expect } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { keywordAutocomplete } from '@/db/keyword-autocomplete-schema';
import { discoveryTargets, discoveryEvidence } from '@/db/discovery-target-schema';
import { minedKeywordCandidates } from '@/db/keyword-mining-schema';
import { products } from '@/db/product-schema';
import {
    claimKeywordAutocomplete,
    saveAutocompleteSuggestions,
    claimAutocompleteJudgments,
    finishKeywordAutocomplete,
    releaseKeywordAutocomplete,
} from '@/db/keyword-autocomplete-work';
import {
    claimProductKeywordMining,
    saveKeywordRecommendations,
    claimKeywordJudgments,
    finishProductKeywordMining,
} from '@/db/keyword-mining-work';
import { saveKeywordJudgments } from '@/db/mined-keyword-candidates';
import { expandKeywordAutocomplete } from '@/services/keyword-autocomplete';
import { reserveKeywordMiningCall, deferKeywordMiningProvider } from '@/db/keyword-mining-capacity';
import {
    resetDiscoveryFixture,
    seedDiscoveryTarget,
    discoveryNow as now,
} from './discovery-fixture';

const seed = () => seedDiscoveryTarget({ kind: 'keyword', term: 'hawaiian christmas' });
const claim = async (at = now) => {
    const work = await claimKeywordAutocomplete(at);
    if (!work) throw new Error('Missing autocomplete work');
    return work;
};
const product = async () => {
    await db
        .insert(products)
        .values({ asin: 'B07ZSKYWL2', marketplaceId: 'ATVPDKIKX0DER', isMerchListing: true });
    const work = await claimProductKeywordMining(now);
    if (!work) throw new Error('Missing product work');
    return work;
};

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('durable keyword autocomplete', () => {
    beforeEach(resetDiscoveryFixture);
    it('expands once, rejects self/duplicates, saves provenance and trials without recursively expanding them', async () => {
        await seed();
        const work = await claim();
        await saveAutocompleteSuggestions(
            work,
            [
                'hawaiian christmas',
                ' Hawaiian Christmas Shirt ',
                'hawaiian christmas shirt',
                'hawaiian christmas cards',
            ],
            now
        );
        const batch = await claimAutocompleteJudgments(work, now);
        expect(batch).toHaveLength(2);
        await saveKeywordJudgments(
            work,
            batch.map(row => ({
                id: row.id,
                probability: row.term.endsWith('shirt') ? 0.95 : 0.05,
            })),
            now
        );
        expect(await finishKeywordAutocomplete(work, now)).toBe(true);
        expect(await claimKeywordAutocomplete(now)).toBeNull();
        expect(
            (await db.select().from(discoveryTargets)).filter(t => t.tracking === 'trial')
        ).toHaveLength(1);
        expect(
            (await db.select().from(discoveryEvidence)).some(
                e => e.kind === 'autocomplete' && e.sourceKey === work.queryId
            )
        ).toBe(true);
        expect((await db.select().from(keywordAutocomplete))[0].suggestions).toHaveLength(2);
    });
    it('resumes saved responses after Jev failure without fetching Amazon again', async () => {
        await seed();
        const work = await claim();
        await saveAutocompleteSuggestions(work, ['hawaiian christmas shirt'], now);
        await releaseKeywordAutocomplete(work, { retryAt: now, now });
        let providerCalls = 0;
        const result = await expandKeywordAutocomplete({
            configured: () => true,
            claim: () => claimKeywordAutocomplete(now),
            suggest: async () => {
                providerCalls++;
                return [];
            },
            save: saveAutocompleteSuggestions,
            claimJudgments: claimAutocompleteJudgments,
            judge: async rows => rows.map(row => ({ id: row.id, probability: 0.95 })),
            saveJudgments: saveKeywordJudgments,
            finish: finishKeywordAutocomplete,
            release: releaseKeywordAutocomplete,
        });
        expect(result.kind).toBe('complete');
        expect(providerCalls).toBe(0);
    });
    it('shares accepted and rejected Ads judgments without another Jev call', async () => {
        const ads = await product();
        await saveKeywordRecommendations(
            ads,
            ['hawaiian christmas shirt', 'hawaiian christmas cards'],
            now
        );
        const batch = await claimKeywordJudgments(ads, now);
        await saveKeywordJudgments(
            ads,
            batch.map(row => ({
                id: row.id,
                probability: row.term.endsWith('shirt') ? 0.95 : 0.05,
            })),
            now
        );
        expect(await finishProductKeywordMining(ads, now)).toBe(true);
        await seed();
        const work = await claim();
        await saveAutocompleteSuggestions(
            work,
            ['hawaiian christmas shirt', 'hawaiian christmas cards'],
            now
        );
        expect(await claimAutocompleteJudgments(work, now)).toEqual([]);
        expect(await finishKeywordAutocomplete(work, now)).toBe(true);
        expect(await db.select().from(minedKeywordCandidates)).toHaveLength(2);
    });
    it('fences stale owners and claims shared candidates once across both sources', async () => {
        await seed();
        const old = await claim();
        expect(await claimKeywordAutocomplete(now)).toBeNull();
        const later = new Date(now.getTime() + 300_001);
        const work = await claim(later);
        await expect(
            saveAutocompleteSuggestions(old, ['hawaiian christmas shirt'], later)
        ).rejects.toThrow('expired');
        await releaseKeywordAutocomplete(old, { now: later });
        await saveAutocompleteSuggestions(work, ['hawaiian christmas shirt'], later);
        const ads = await product();
        await saveKeywordRecommendations(ads, ['hawaiian christmas shirt'], later);
        const batches = await Promise.all([
            claimAutocompleteJudgments(work, later),
            claimKeywordJudgments(ads, later),
        ]);
        expect(batches.flat()).toHaveLength(1);
        const owner = batches[0].length ? work : ads;
        await saveKeywordJudgments(
            owner,
            batches.flat().map(row => ({ id: row.id, probability: 0.95 })),
            later
        );
        expect(await finishKeywordAutocomplete(work, later)).toBe(true);
        expect(await finishProductKeywordMining(ads, later)).toBe(true);
    });
    it('completes empty responses and ignores disabled seeds', async () => {
        const target = await seed();
        await db
            .update(discoveryTargets)
            .set({ enabled: false })
            .where(eq(discoveryTargets.id, target.id));
        expect(await claimKeywordAutocomplete(now)).toBeNull();
        await db
            .update(discoveryTargets)
            .set({ enabled: true })
            .where(eq(discoveryTargets.id, target.id));
        const work = await claim();
        await saveAutocompleteSuggestions(work, [], now);
        expect(await finishKeywordAutocomplete(work, now)).toBe(true);
        expect(await claimKeywordAutocomplete(now)).toBeNull();
    });
    it('persists independent autocomplete pacing and never shortens cooldowns', async () => {
        await reserveKeywordMiningCall('autocomplete', now);
        await expect(reserveKeywordMiningCall('autocomplete', now)).rejects.toThrow('deferred');
        await reserveKeywordMiningCall('ads', now);
        await deferKeywordMiningProvider('autocomplete', new Date(now.getTime() + 60_000));
        await deferKeywordMiningProvider('autocomplete', new Date(now.getTime() + 20_000));
        await expect(
            reserveKeywordMiningCall('autocomplete', new Date(now.getTime() + 30_000))
        ).rejects.toThrow('deferred');
    });
});
