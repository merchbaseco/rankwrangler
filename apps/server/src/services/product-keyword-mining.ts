import { saveKeywordJudgments } from '@/db/mined-keyword-candidates';
import {
    claimProductKeywordMining,
    saveKeywordRecommendations,
    claimKeywordJudgments,
    finishProductKeywordMining,
    releaseProductKeywordMining,
} from '@/db/keyword-mining-work';
import { claimRelevanceCandidates, saveProductRelevance } from '@/db/product-keyword-relevance';
import { KeywordMiningDeferred } from '@/db/keyword-mining-capacity';
import {
    fetchAsinKeywordRecommendations,
    judgeMinedKeywords,
    judgeProductRelevance,
    keywordMiningConfigured,
} from './keyword-mining-providers';

const defaults = {
    configured: keywordMiningConfigured,
    claim: claimProductKeywordMining,
    recommend: fetchAsinKeywordRecommendations,
    saveRecommendations: saveKeywordRecommendations,
    claimJudgments: claimKeywordJudgments,
    judge: judgeMinedKeywords,
    saveJudgments: saveKeywordJudgments,
    claimRelevance: claimRelevanceCandidates,
    judgeRelevance: judgeProductRelevance,
    saveRelevance: saveProductRelevance,
    finish: finishProductKeywordMining,
    release: releaseProductKeywordMining,
};

// One provider call per pass: the coordinator returns as soon as the next provider is ready, so
// a product's Ads, global fit and product relevance stages interleave with other ready work.
export const mineProductKeywords = async (
    deps = defaults,
    options: { kind: 'source' | 'judgment'; productId?: string } = { kind: 'source' }
) => {
    if (!deps.configured()) return { didWork: false, kind: 'disabled' as const, nextWakeAt: null };
    const work = await deps.claim(new Date(), options);
    if (!work) return { didWork: false, kind: 'idle' as const, nextWakeAt: null };
    let didWork = false;
    try {
        if (work.stage === 'pending') {
            await deps.saveRecommendations(work, await deps.recommend(work.product.asin));
            didWork = true;
        } else {
            const fit = await deps.claimJudgments(work);
            const relevance = fit.length ? [] : await deps.claimRelevance(work);
            const title = work.product.title?.trim();
            if (fit.length) await deps.saveJudgments(work, await deps.judge(fit));
            // Without a title there is nothing to judge topical fit against; select nothing
            // rather than admit phrases that may belong to a different subject.
            else if (relevance.length)
                await deps.saveRelevance(
                    work,
                    title
                        ? await deps.judgeRelevance(title, relevance)
                        : relevance.map(row => ({ id: row.id, probability: 0 }))
                );
            didWork = fit.length > 0 || relevance.length > 0;
        }
        const complete = await deps.finish(work);
        if (complete)
            return {
                didWork: true,
                kind: 'complete' as const,
                asin: work.product.asin,
                nextWakeAt: new Date(),
            };
        // No progress means another claimant holds this product's unjudged phrases: push back only
        // this product so other ready products are still claimed now.
        await deps.release(work, { retryAt: new Date(Date.now() + (didWork ? 0 : 30_000)) });
        return { didWork, kind: 'yielded' as const, asin: work.product.asin, nextWakeAt: new Date() };
    } catch (error) {
        if (error instanceof KeywordMiningDeferred) {
            await deps.release(work, { retryAt: error.retryAt });
            return {
                didWork,
                kind: 'deferred' as const,
                asin: work.product.asin,
                nextWakeAt: error.retryAt,
            };
        }
        await deps.release(work, { failed: true });
        throw error;
    }
};
