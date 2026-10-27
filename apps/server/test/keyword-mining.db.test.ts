import { saveKeywordJudgments } from '@/db/mined-keyword-candidates';
import { beforeEach, describe, it, expect } from 'bun:test';
import { recordProductSearchInterest } from '@/db/product-search-interest';
import { productSearchInput } from '@/api/product-search-input';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/product-schema';
import {
    minedKeywordCandidates as candidates,
    productKeywordMining as mining,
    productKeywordCandidates as links,
} from '@/db/keyword-mining-schema';
import { discoveryTargets } from '@/db/discovery-target-schema';
import {
    claimProductKeywordMining,
    saveKeywordRecommendations,
    claimKeywordJudgments,
    finishProductKeywordMining,
    releaseProductKeywordMining,
} from '@/db/keyword-mining-work';
import { mineProductKeywords } from '@/services/product-keyword-mining';
import { claimRelevanceCandidates, saveProductRelevance } from '@/db/product-keyword-relevance';
import { reserveKeywordMiningCall, deferKeywordMiningProvider } from '@/db/keyword-mining-capacity';
import { resetDiscoveryFixture, discoveryNow as now } from './discovery-fixture';
const market = 'ATVPDKIKX0DER';
const add = async (asin: string) => {
    const [p] = await db
        .insert(products)
        .values({
            asin,
            marketplaceId: market,
            title: 'Funny Fishing Shirt',
            isMerchListing: true,
            rootCategoryBsr: 100_000,
        })
        .returning();
    return p;
};
const relevant = async (work: Awaited<ReturnType<typeof claim>>, probability = 0.9) => {
    const rows = await claimRelevanceCandidates(work);
    await saveProductRelevance(
        work,
        rows.map(row => ({ id: row.id, probability }))
    );
    return rows;
};
const claim = async (at = now) => {
    const work = await claimProductKeywordMining(at);
    if (!work) throw new Error('Missing mining work');
    return work;
};
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('once-per-ASIN keyword mining', () => {
    beforeEach(resetDiscoveryFixture);
    it('mines each product once, globally reuses 19 of 20 judgments, and does not remine after rank/title changes', async () => {
        const first = await add('B0TST00001');
        const work = await claim();
        const terms = Array.from({ length: 20 }, (_, i) => `fishing niche ${i} shirt`);
        await saveKeywordRecommendations(work, terms, now);
        const batch = await claimKeywordJudgments(work, now);
        expect(batch).toHaveLength(20);
        await saveKeywordJudgments(
            work,
            batch.map(row => ({ id: row.id, probability: 0.95 })),
            now
        );
        await saveKeywordJudgments(
            work,
            batch.map(row => ({ id: row.id, probability: 0.95 })),
            now
        );
        expect(await finishProductKeywordMining(work, now)).toBe(false);
        await relevant(work);
        expect(await finishProductKeywordMining(work, now)).toBe(true);
        await db
            .update(products)
            .set({ title: 'Different title', rootCategoryBsr: 50_000 })
            .where(eq(products.id, first.id));
        expect(await claimProductKeywordMining(now)).toBeNull();
        await add('B0TST00002');
        const second = await claim();
        await saveKeywordRecommendations(second, [...terms.slice(0, 19), 'new niche shirt'], now);
        const remaining = await claimKeywordJudgments(second, now);
        expect(remaining.map(row => row.term)).toEqual(['new niche shirt']);
        await saveKeywordJudgments(
            second,
            remaining.map(row => ({ id: row.id, probability: 0.9 })),
            now
        );
        await relevant(second);
        expect(await finishProductKeywordMining(second, now)).toBe(true);
        expect(await db.select().from(candidates)).toHaveLength(21);
        expect(await db.select().from(links)).toHaveLength(40);
        const targets = await db.select().from(discoveryTargets);
        expect(targets.every(row => row.tracking === 'trial')).toBe(true);
        // Both products' first five Ads phrases are the same five, so they share five targets.
        expect(targets).toHaveLength(5);
        expect((await db.select().from(links)).filter(row => row.selected)).toHaveLength(10);
    });
    it('resumes a saved Ads response after a judgment failure without another Ads call', async () => {
        await add('B0TST00001');
        let at = now;
        let ads = 0;
        let judgments = 0;
        const deps = {
            configured: () => true,
            claim: (_now: Date, options?: { kind: 'source' | 'judgment' }) =>
                claimProductKeywordMining(at, options),
            recommend: async () => {
                ads += 1;
                return ['fishing shirt'];
            },
            saveRecommendations: saveKeywordRecommendations,
            claimJudgments: claimKeywordJudgments,
            judge: async (rows: { id: string; term: string }[]) => {
                judgments += 1;
                if (judgments === 1) throw new Error('judge offline');
                return rows.map(row => ({ id: row.id, probability: 0.9 }));
            },
            saveJudgments: saveKeywordJudgments,
            claimRelevance: claimRelevanceCandidates,
            judgeRelevance: async (_title: string, rows: { id: string; term: string }[]) =>
                rows.map(row => ({ id: row.id, probability: 0.9 })),
            saveRelevance: saveProductRelevance,
            finish: finishProductKeywordMining,
            release: (
                work: Parameters<typeof releaseProductKeywordMining>[0],
                input: Parameters<typeof releaseProductKeywordMining>[1]
            ) => releaseProductKeywordMining(work, { ...input, now: at }),
        };
        expect((await mineProductKeywords(deps)).kind).toBe('yielded');
        at = new Date(Date.now() + 1000);
        await expect(mineProductKeywords(deps, { kind: 'judgment' as const })).rejects.toThrow('judge offline');
        expect((await db.select().from(mining))[0].stage).toBe('recommendationsSaved');
        at = new Date(at.getTime() + 3_600_000);
        expect((await mineProductKeywords(deps)).kind).toBe('idle');
        expect((await mineProductKeywords(deps, { kind: 'judgment' as const })).kind).toBe('yielded');
        expect((await mineProductKeywords(deps, { kind: 'judgment' as const })).kind).toBe('complete');
        expect(ads).toBe(1);
        expect(judgments).toBe(2);
    });
    it('completes successful empty and all-rejected recommendations permanently', async () => {
        await add('B0TST00001');
        const empty = await claim();
        await saveKeywordRecommendations(empty, [], now);
        expect(await finishProductKeywordMining(empty, now)).toBe(true);
        await add('B0TST00002');
        const rejected = await claim();
        await saveKeywordRecommendations(rejected, ['t light'], now);
        const rows = await claimKeywordJudgments(rejected, now);
        await saveKeywordJudgments(
            rejected,
            rows.map(row => ({ id: row.id, probability: 0.01 })),
            now
        );
        expect(await finishProductKeywordMining(rejected, now)).toBe(true);
        expect(await db.select().from(discoveryTargets)).toHaveLength(0);
        expect(await claimProductKeywordMining(now)).toBeNull();
    });
    it('fences expired owners and grants overlapping keyword judgments to only one worker', async () => {
        await add('B0TST00001');
        const old = await claim();
        const current = await claim(new Date(now.getTime() + 301_000));
        await expect(saveKeywordRecommendations(old, ['fishing shirt'], now)).rejects.toThrow(
            'expired'
        );
        await saveKeywordRecommendations(current, ['fishing shirt'], now);
        await releaseProductKeywordMining(current, { now });
        await add('B0TST00002');
        // The saved first product is judgment work; the new second product is source work.
        const a = await claimProductKeywordMining(now, { kind: 'judgment' });
        if (!a) throw new Error('Missing saved mining work');
        const bProduct = await add('B0TST00003');
        const [bMining] = await db
            .insert(mining)
            .values({
                productId: bProduct.id,
                claimToken: '11111111-1111-4111-8111-111111111111',
                claimAt: now,
                nextDueAt: now,
            })
            .returning();
        const b = { ...bMining, product: bProduct, claimToken: bMining.claimToken! };
        await saveKeywordRecommendations(b, ['fishing shirt'], now);
        const batches = await Promise.all([
            claimKeywordJudgments(a, now),
            claimKeywordJudgments(b, now),
        ]);
        expect(batches.flat()).toHaveLength(1);
    });
    it('persists provider cooldown and never shortens a prior deadline', async () => {
        await reserveKeywordMiningCall('ads', now);
        await expect(reserveKeywordMiningCall('ads', now)).rejects.toThrow('deferred');
        const retryAt = new Date(now.getTime() + 120000);
        await deferKeywordMiningProvider('ads', retryAt);
        await deferKeywordMiningProvider('ads', new Date(now.getTime() + 60000));
        await expect(
            reserveKeywordMiningCall('ads', new Date(now.getTime() + 119000))
        ).rejects.toThrow('deferred');
        await reserveKeywordMiningCall('ads', retryAt);
    });
    it('does not overwrite a paid in-flight judgment when another ASIN sees a newly tracked phrase', async () => {
        await add('B0TST00001');
        const a = await claim();
        await saveKeywordRecommendations(a, ['fishing shirt', 'nurse shirt'], now);
        const batch = await claimKeywordJudgments(a, now);
        await recordProductSearchInterest(productSearchInput.parse({ term: 'fishing shirt' }));
        const product = await add('B0TST00002');
        const [m] = await db
            .insert(mining)
            .values({
                productId: product.id,
                claimToken: '22222222-2222-4222-8222-222222222222',
                claimAt: now,
                nextDueAt: now,
            })
            .returning();
        const b = { ...m, product, claimToken: m.claimToken! };
        await saveKeywordRecommendations(b, ['fishing shirt'], now);
        expect((await db.select().from(candidates)).every(row => row.verdict === null)).toBe(true);
        await saveKeywordJudgments(
            a,
            batch.map(row => ({ id: row.id, probability: 0.95 })),
            now
        );
        await relevant(a);
        await relevant(b);
        expect(await finishProductKeywordMining(a, now)).toBe(true);
        expect(await finishProductKeywordMining(b, now)).toBe(true);
        expect((await db.select().from(candidates)).every(row => row.verdict === 'accepted')).toBe(
            true
        );
    });
    it('counts already-tracked phrases in the cap, keeps provider order and never rejects globally for one product', async () => {
        const terms = ['cat dad shirt', 'batman shirt', 'funny cat dad tee', 'cat mom shirt'];
        await recordProductSearchInterest(productSearchInput.parse({ term: 'cat mom shirt' }));
        await add('B0TST00001');
        const work = await claim();
        await saveKeywordRecommendations(work, terms, now);
        expect((await db.select().from(mining))[0].recommendations).toEqual(terms);
        const fit = await claimKeywordJudgments(work, now);
        await saveKeywordJudgments(
            work,
            fit.map(row => ({ id: row.id, probability: 0.95 })),
            now
        );
        const asked = await claimRelevanceCandidates(work);
        expect(asked.map(row => row.term)).toEqual(terms);
        await saveProductRelevance(
            work,
            asked.map(row => ({ id: row.id, probability: row.term === 'batman shirt' ? 0.1 : 0.9 }))
        );
        expect(await finishProductKeywordMining(work, now)).toBe(true);
        const selected = await db
            .select({ term: candidates.term })
            .from(links)
            .innerJoin(candidates, eq(candidates.id, links.candidateId))
            .where(eq(links.selected, true));
        expect(selected.map(row => row.term).sort()).toEqual(['cat dad shirt', 'cat mom shirt']);
        const batman = (await db.select().from(candidates)).find(row => row.term === 'batman shirt');
        expect(batman?.verdict).toBe('accepted');
    });
});
