import { AutocompleteDeferred } from '@/db/keyword-autocomplete-capacity';
import {
    claimKeywordAutocomplete,
    finishKeywordAutocomplete,
    releaseKeywordAutocomplete,
} from '@/db/keyword-autocomplete-work';
import { fetchKeywordAutocomplete } from './keyword-autocomplete-provider';

const defaults = {
    claim: claimKeywordAutocomplete,
    suggest: fetchKeywordAutocomplete,
    finish: finishKeywordAutocomplete,
    release: releaseKeywordAutocomplete,
};

// One Amazon autocomplete call for one tracked seed. Its suggestions become keyword trials.
export const expandKeywordAutocomplete = async (queryId?: string, deps = defaults) => {
    const work = await deps.claim(new Date(), queryId);
    if (!work) return { didWork: false, kind: 'idle' as const, nextWakeAt: null };
    try {
        const suggestions = await deps.suggest(work.term);
        await deps.finish(work, suggestions);
        return {
            didWork: true,
            kind: 'complete' as const,
            term: work.term,
            suggestions: suggestions.length,
            nextWakeAt: null,
        };
    } catch (error) {
        if (error instanceof AutocompleteDeferred) {
            await deps.release(work, { retryAt: error.retryAt });
            return {
                didWork: false,
                kind: 'deferred' as const,
                term: work.term,
                nextWakeAt: error.retryAt,
            };
        }
        await deps.release(work, { failed: true });
        throw error;
    }
};
