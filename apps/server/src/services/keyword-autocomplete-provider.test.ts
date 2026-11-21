import { describe, expect, it } from 'bun:test';
import {
    AutocompleteDeferred,
    computeThrottlePlan,
    jitteredSpacingMs,
} from '@/db/keyword-autocomplete-capacity';
import {
    createAutocompleteRelayUrl,
    parseAutocompleteSuggestions,
} from './keyword-autocomplete-client';
import {
    fetchKeywordAutocomplete,
    isAutocompleteRelayConfigured,
} from './keyword-autocomplete-provider';

describe('Amazon autocomplete boundary', () => {
    it('keeps native keyword suggestions, deduplicates and excludes the seed and non-keywords', () => {
        const suggestions = [
            ' Hawaiian Christmas Shirt ',
            'hawaiian christmas shirt',
            'hawaiian christmas',
            'tropical santa shirt',
            'hawaiian christmas cards',
        ].map(value => ({ value, type: 'KEYWORD' }));
        suggestions.push({ value: 'hawaiian christmas deals', type: 'WIDGET' });
        expect(parseAutocompleteSuggestions('hawaiian christmas', { suggestions })).toEqual([
            'hawaiian christmas shirt',
            'tropical santa shirt',
            'hawaiian christmas cards',
        ]);
    });
    it('accepts pluralization and inserted words returned by Amazon', () => {
        expect(
            parseAutocompleteSuggestions('mele kalikimaka t shirt,', {
                suggestions: [
                    { value: 'mele kalikimaka t shirts', type: 'KEYWORD' },
                    { value: 'mele kalikimaka christmas t shirt', type: 'KEYWORD' },
                    { value: 'mele kalikimaka t shirt', type: 'KEYWORD' },
                    { value: 'mele kalikimaka t shirt,', type: 'KEYWORD' },
                ],
            })
        ).toEqual(['mele kalikimaka t shirts', 'mele kalikimaka christmas t shirt']);
    });
    it('limits each response to ten phrases and refuses malformed responses', () => {
        expect(
            parseAutocompleteSuggestions('fishing', {
                suggestions: Array.from({ length: 30 }, (_, i) => ({
                    value: `fishing shirt ${i}`,
                    type: 'KEYWORD',
                })),
            })
        ).toHaveLength(10);
        expect(() => parseAutocompleteSuggestions('fishing', { html: 'blocked' })).toThrow();
        expect(parseAutocompleteSuggestions('fishing', { suggestions: [] })).toEqual([]);
        expect(
            parseAutocompleteSuggestions('fishing', {
                suggestions: [
                    { type: 'KEYWORD', value: '' },
                    { type: 'KEYWORD', value: 'x'.repeat(201) },
                    { type: 'KEYWORD', value: 'fishing dad shirt' },
                ],
            })
        ).toEqual(['fishing dad shirt']);
    });
    it('builds the authenticated relay URL with normalized prefix only', () => {
        const url = createAutocompleteRelayUrl(
            'https://rankwrangler-autocomplete-relay.example.workers.dev',
            'mele kalikimaka t shirt,'
        );
        expect(url.origin + url.pathname).toBe(
            'https://rankwrangler-autocomplete-relay.example.workers.dev/suggestions'
        );
        expect(url.searchParams.get('prefix')).toBe('mele kalikimaka t shirt');
        expect([...url.searchParams.keys()]).toEqual(['prefix']);
    });
    it('ignores widget payloads without dropping valid keyword suggestions', () => {
        expect(
            parseAutocompleteSuggestions('mele kalikimaka t shirt', {
                suggestions: [
                    { type: 'WIDGET', widget: { title: 'Ask Alexa' } },
                    { type: 'KEYWORD', value: 'mele kalikimaka christmas t shirt' },
                ],
            })
        ).toEqual(['mele kalikimaka christmas t shirt']);
        expect(() =>
            parseAutocompleteSuggestions('shirt', { suggestions: [{ type: 'KEYWORD' }] })
        ).toThrow();
    });

    it('fails closed when the autocomplete relay is not configured', async () => {
        expect(isAutocompleteRelayConfigured()).toBe(false);
        await expect(fetchKeywordAutocomplete('teacher shirt')).rejects.toBeInstanceOf(
            AutocompleteDeferred
        );
    });
});

describe('Autocomplete capacity pacing', () => {
    it('backs off briefly on an isolated 5xx without doubling standing spacing', () => {
        expect(
            computeThrottlePlan({
                currentSpacingMs: 10_000,
                consecutiveThrottles: 0,
                retryAfterMs: null,
                statusCode: 503,
            })
        ).toEqual({
            throttles: 1,
            waitMs: 60_000,
            nextSpacingMs: 10_000,
        });
    });

    it('doubles spacing on 429 or repeated 5xx and respects Retry-After', () => {
        expect(
            computeThrottlePlan({
                currentSpacingMs: 10_000,
                consecutiveThrottles: 0,
                retryAfterMs: null,
                statusCode: 429,
            })
        ).toEqual({
            throttles: 1,
            waitMs: 60_000,
            nextSpacingMs: 20_000,
        });
        expect(
            computeThrottlePlan({
                currentSpacingMs: 10_000,
                consecutiveThrottles: 1,
                retryAfterMs: 180_000,
                statusCode: 503,
            })
        ).toEqual({
            throttles: 2,
            waitMs: 180_000,
            nextSpacingMs: 20_000,
        });
    });

    it('applies bounded ±20% jitter to spacing intervals', () => {
        expect(jitteredSpacingMs(10_000, 0)).toBe(8_000);
        expect(jitteredSpacingMs(10_000, 0.5)).toBe(10_000);
        expect(jitteredSpacingMs(10_000, 1)).toBe(12_000);
    });
});
