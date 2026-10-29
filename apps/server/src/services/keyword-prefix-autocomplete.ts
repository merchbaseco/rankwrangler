import { AutocompleteDeferred } from '@/db/keyword-autocomplete-capacity';
import {
    claimPrefixAutocomplete,
    finishPrefixAutocomplete,
    releasePrefixAutocomplete,
} from '@/db/keyword-prefix-autocomplete-work';
import { fetchKeywordAutocomplete } from './keyword-autocomplete-provider';
import { prefixTrialTerms } from './keyword-prefix';

const defaults = {
    claim: claimPrefixAutocomplete,
    suggest: fetchKeywordAutocomplete,
    finish: finishPrefixAutocomplete,
    release: releasePrefixAutocomplete,
};

// One Amazon autocomplete call with a prefix as the seed. Suggestions that name a Merch product and
// keep the prefix ("teacher" -> "teacher tumbler") become keyword trials.
export const expandPrefixAutocomplete = async (prefixId?: string, deps = defaults) => {
    const work = await deps.claim(new Date(), prefixId);
    if (!work) return { didWork: false, kind: 'idle' as const, nextWakeAt: null };
    try {
        const suggestions = await deps.suggest(work.prefix);
        const trials = prefixTrialTerms(work.prefix, suggestions);
        await deps.finish(work, suggestions, trials);
        return {
            didWork: true,
            kind: 'complete' as const,
            prefix: work.prefix,
            suggestions: suggestions.length,
            trials: trials.length,
            nextWakeAt: null,
        };
    } catch (error) {
        if (error instanceof AutocompleteDeferred) {
            await deps.release(work, { retryAt: error.retryAt });
            return {
                didWork: false,
                kind: 'deferred' as const,
                prefix: work.prefix,
                nextWakeAt: error.retryAt,
            };
        }
        await deps.release(work, { failed: true });
        throw error;
    }
};
