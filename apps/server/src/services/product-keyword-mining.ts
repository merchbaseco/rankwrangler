import { saveKeywordJudgments } from '@/db/mined-keyword-candidates';
import {
    claimProductKeywordMining,
    saveKeywordRecommendations,
    claimKeywordJudgments,
    finishProductKeywordMining,
    releaseProductKeywordMining,
} from '@/db/keyword-mining-work';
import { KeywordMiningDeferred } from '@/db/keyword-mining-capacity';
import {
    fetchAsinKeywordRecommendations,
    judgeMinedKeywords,
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
    finish: finishProductKeywordMining,
    release: releaseProductKeywordMining,
};
export const mineProductKeywords = async (deps = defaults) => {
    if (!deps.configured()) return { didWork: false, kind: 'disabled' as const, nextWakeAt: null };
    const work = await deps.claim();
    if (!work) return { didWork: false, kind: 'idle' as const, nextWakeAt: null };
    try {
        if (work.stage === 'pending')
            await deps.saveRecommendations(work, await deps.recommend(work.product.asin));
        let judgedBatches = 0;
        for (let batch = 0; batch < 2; batch += 1) {
            const candidates = await deps.claimJudgments(work);
            if (!candidates.length) break;
            await deps.saveJudgments(work, await deps.judge(candidates));
            judgedBatches += 1;
        }
        const complete = await deps.finish(work);
        const nextWakeAt = new Date(Date.now() + (judgedBatches ? 2000 : 30_000));
        if (!complete) await deps.release(work, { retryAt: nextWakeAt });
        return {
            didWork: true,
            kind: complete ? ('complete' as const) : ('yielded' as const),
            nextWakeAt: complete ? new Date(Date.now() + 2000) : nextWakeAt,
        };
    } catch (error) {
        if (error instanceof KeywordMiningDeferred) {
            await deps.release(work, { retryAt: error.retryAt });
            return { didWork: false, kind: 'deferred' as const, nextWakeAt: error.retryAt };
        }
        await deps.release(work, { failed: true });
        throw error;
    }
};
