import { normalizeDiscoveryKeyword } from './discovery-candidate-policy';
import { z } from 'zod';
import {
    reserveKeywordMiningCall,
    deferKeywordMiningProvider,
    KeywordMiningDeferred,
} from '@/db/keyword-mining-capacity';
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
    await reserveKeywordMiningCall('autocomplete');
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
    if (response.status === 429 || response.status >= 500 || response.status === 403) {
        const raw = response.headers.get('retry-after');
        const seconds = Number(raw);
        const wait =
            raw && !Number.isFinite(seconds)
                ? Date.parse(raw) - Date.now()
                : (seconds || 60) * 1000;
        const retryAt = new Date(
            Date.now() +
                Math.max(
                    response.status === 403 ? 3_600_000 : 60_000,
                    Number.isFinite(wait) ? wait : 60_000
                )
        );
        await deferKeywordMiningProvider('autocomplete', retryAt);
        throw new KeywordMiningDeferred(retryAt);
    }
    if (!response.ok) throw new Error(`Autocomplete request failed (${response.status})`);
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
