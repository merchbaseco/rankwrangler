import { env } from '@/config/env';
import {
    claimKeywordAutocomplete,
    saveAutocompleteSuggestions,
    claimAutocompleteJudgments,
    finishKeywordAutocomplete,
    releaseKeywordAutocomplete,
} from '@/db/keyword-autocomplete-work';
import { saveKeywordJudgments } from '@/db/mined-keyword-candidates';
import { KeywordMiningDeferred } from '@/db/keyword-mining-capacity';
import { judgeMinedKeywords } from './keyword-mining-providers';
import { fetchKeywordAutocomplete } from './keyword-autocomplete-provider';

const defaults = {
    configured: () => Boolean(env.RANKWRANGLER_TYPESAFE_API_KEY),
    claim: claimKeywordAutocomplete,
    suggest: fetchKeywordAutocomplete,
    save: saveAutocompleteSuggestions,
    claimJudgments: claimAutocompleteJudgments,
    judge: judgeMinedKeywords,
    saveJudgments: saveKeywordJudgments,
    finish: finishKeywordAutocomplete,
    release: releaseKeywordAutocomplete,
};
export const expandKeywordAutocomplete = async (deps = defaults) => {
    if (!deps.configured()) return { didWork: false, kind: 'disabled' as const, nextWakeAt: null };
    const work = await deps.claim();
    if (!work) return { didWork: false, kind: 'idle' as const, nextWakeAt: null };
    try {
        if (work.stage === 'pending') await deps.save(work, await deps.suggest(work.term));
        const candidates = await deps.claimJudgments(work);
        if (candidates.length) await deps.saveJudgments(work, await deps.judge(candidates));
        const complete = await deps.finish(work);
        const nextWakeAt = new Date(Date.now() + (complete ? 10_000 : 30_000));
        if (!complete) await deps.release(work, { retryAt: nextWakeAt });
        return {
            didWork: true,
            kind: complete ? ('complete' as const) : ('yielded' as const),
            nextWakeAt,
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
