import { z } from 'zod';
import {
    reserveKeywordMiningCall,
    deferKeywordMiningProvider,
    KeywordMiningDeferred,
} from '@/db/keyword-mining-capacity';
import { captureProviderAttempt } from './providers/provider-telemetry';

const responseSchema = z.object({
    suggestions: z
        .array(z.object({ value: z.string().min(1).max(200), type: z.string() }))
        .max(100),
});
export const parseAutocompleteSuggestions = (seed: string, input: unknown) => {
    const normalized = seed.trim().replace(/\s+/gu, ' ').toLowerCase();
    return [
        ...new Set(
            responseSchema
                .parse(input)
                .suggestions.filter(row => row.type === 'KEYWORD')
                .map(row => row.value.trim().replace(/\s+/gu, ' ').toLowerCase())
                .filter(term => term !== normalized && term.startsWith(`${normalized} `))
        ),
    ].slice(0, 10);
};

export const fetchKeywordAutocomplete = async (seed: string) => {
    await reserveKeywordMiningCall('autocomplete');
    const url = new URL('https://completion.amazon.com/api/2017/suggestions');
    url.search = new URLSearchParams({
        limit: '10',
        prefix: seed,
        'suggestion-type': 'KEYWORD',
        alias: 'aps',
        mid: 'ATVPDKIKX0DER',
    }).toString();
    const response = await captureProviderAttempt(
        { provider: 'amazonAutocomplete', operation: 'amazon.autocomplete' },
        () =>
            fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
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
