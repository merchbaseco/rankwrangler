import { normalizeDiscoveryKeyword } from './discovery-candidate-policy';
import { z } from 'zod';
import {
    AutocompleteDeferred,
    deferAutocomplete,
    relaxAutocomplete,
    reserveAutocompleteCall,
    retryAfterMs,
    throttleAutocomplete,
} from '@/db/keyword-autocomplete-capacity';
import { captureProviderAttempt } from './providers/provider-telemetry';

const keywordSuggestionSchema = z.object({
    type: z.literal('KEYWORD'),
    value: z.string(),
});
const responseSchema = z.object({
    suggestions: z.array(z.object({ type: z.string() }).passthrough()).max(100),
});
export const parseAutocompleteSuggestions = (seed: string, input: unknown) => {
    const normalized = normalizeDiscoveryKeyword(seed).toLowerCase();
    return [
        ...new Set(
            responseSchema
                .parse(input)
                .suggestions.filter(row => row.type === 'KEYWORD')
                // A missing value means the format changed and fails loudly; an empty or overlong
                // value is skipped, since failing the seed would repeat on every retry.
                .map(row => normalizeDiscoveryKeyword(keywordSuggestionSchema.parse(row).value))
                .map(term => term.toLowerCase())
                .filter(term => term.length <= 200)
                .filter(term => term.length > 0 && term !== normalized)
        ),
    ].slice(0, 10);
};

export const fetchKeywordAutocomplete = async (seed: string) => {
    await reserveAutocompleteCall();
    const url = createKeywordAutocompleteUrl(seed);
    const response = await captureProviderAttempt(
        { provider: 'amazonAutocomplete', operation: 'amazon.autocomplete' },
        () =>
            fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    Accept: 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                signal: AbortSignal.timeout(10_000),
            })
    );
    if (response.status === 403) {
        const retryAt = new Date(Date.now() + 3_600_000);
        await deferAutocomplete(retryAt);
        throw new AutocompleteDeferred(retryAt);
    }
    if (response.status === 429 || response.status >= 500)
        throw new AutocompleteDeferred(
            await throttleAutocomplete(retryAfterMs(response.headers.get('retry-after')))
        );
    if (!response.ok) throw new Error(`Autocomplete request failed (${response.status})`);
    await relaxAutocomplete();
    return parseAutocompleteSuggestions(seed, await response.json());
};

export const createKeywordAutocompleteUrl = (seed: string) => {
    const url = new URL('https://www.amazon.com/suggestions');
    url.search = new URLSearchParams([
        ['limit', '11'],
        ['prefix', normalizeDiscoveryKeyword(seed)],
        ['suggestion-type', 'WIDGET'],
        ['suggestion-type', 'KEYWORD'],
        ['alias', 'aps'],
        ['site-variant', 'desktop'],
        ['version', '3'],
        ['lop', 'en_US'],
        ['fb', '1'],
        ['mid', 'ATVPDKIKX0DER'],
    ]).toString();
    return url;
};
