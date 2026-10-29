import { AutocompleteDeferred } from '@/db/keyword-autocomplete-capacity';
import {
    claimThemeAutocomplete,
    finishThemeAutocomplete,
    releaseThemeAutocomplete,
} from '@/db/keyword-theme-autocomplete-work';
import { fetchKeywordAutocomplete } from './keyword-autocomplete-provider';
import { themeTrialTerms } from './keyword-theme';

const defaults = {
    claim: claimThemeAutocomplete,
    suggest: fetchKeywordAutocomplete,
    finish: finishThemeAutocomplete,
    release: releaseThemeAutocomplete,
};

// One Amazon autocomplete call with a theme as the seed. Suggestions that name a Merch product and
// keep the theme ("teacher" -> "teacher tumbler") become keyword trials.
export const expandThemeAutocomplete = async (themeId?: string, deps = defaults) => {
    const work = await deps.claim(new Date(), themeId);
    if (!work) return { didWork: false, kind: 'idle' as const, nextWakeAt: null };
    try {
        const suggestions = await deps.suggest(work.theme);
        const trials = themeTrialTerms(work.theme, suggestions);
        await deps.finish(work, suggestions, trials);
        return {
            didWork: true,
            kind: 'complete' as const,
            theme: work.theme,
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
                theme: work.theme,
                nextWakeAt: error.retryAt,
            };
        }
        await deps.release(work, { failed: true });
        throw error;
    }
};
