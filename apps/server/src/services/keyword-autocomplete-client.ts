import { z } from 'zod';
import { normalizeDiscoveryKeyword } from './discovery-candidate-policy';

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

export const createAutocompleteRelayUrl = (relayBaseUrl: string, seed: string) => {
    const url = new URL('/suggestions', relayBaseUrl);
    url.searchParams.set('prefix', normalizeDiscoveryKeyword(seed));
    return url;
};

/** Executes a single Amazon autocomplete request strictly through the Cloudflare Worker relay. */
export const fetchKeywordAutocompleteResponse = (
    seed: string,
    relay: Readonly<{ url: string; token: string }>,
    signal: AbortSignal = AbortSignal.timeout(10_000)
) =>
    fetch(createAutocompleteRelayUrl(relay.url, seed), {
        headers: {
            Authorization: `Bearer ${relay.token}`,
            Accept: 'application/json',
        },
        signal,
    });
