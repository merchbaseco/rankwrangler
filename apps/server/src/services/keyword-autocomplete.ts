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
// One provider call per pass, like product mining, so a cooling provider never idles other work.
export const expandKeywordAutocomplete = async (
    deps = defaults,
    options: { kind: 'source' | 'judgment'; queryId?: string } = { kind: 'source' }
) => {
    if (!deps.configured()) return { didWork: false, kind: 'disabled' as const, nextWakeAt: null };
    const work = await deps.claim(new Date(), options);
    if (!work) return { didWork: false, kind: 'idle' as const, nextWakeAt: null };
    let didWork = false;
    try {
        if (work.stage === 'pending') await deps.save(work, await deps.suggest(work.term));
        else {
            const candidates = await deps.claimJudgments(work);
            if (candidates.length) await deps.saveJudgments(work, await deps.judge(candidates));
            didWork = candidates.length > 0;
        }
        didWork ||= work.stage === 'pending';
        const complete = await deps.finish(work);
        if (complete)
            return { didWork: true, kind: 'complete' as const, term: work.term, nextWakeAt: new Date() };
        await deps.release(work, { retryAt: new Date(Date.now() + (didWork ? 0 : 30_000)) });
        return { didWork, kind: 'yielded' as const, term: work.term, nextWakeAt: new Date() };
    } catch (error) {
        if (error instanceof KeywordMiningDeferred) {
            await deps.release(work, { retryAt: error.retryAt });
            return { didWork, kind: 'deferred' as const, term: work.term, nextWakeAt: error.retryAt };
        }
        await deps.release(work, { failed: true });
        throw error;
    }
};
