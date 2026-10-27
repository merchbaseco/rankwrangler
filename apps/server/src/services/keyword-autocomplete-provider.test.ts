import { describe, it, expect } from 'bun:test';
import {
    parseAutocompleteSuggestions,
    createKeywordAutocompleteUrl,
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
    it('uses the desktop request profile without session or keystroke identifiers', () => {
        const url = createKeywordAutocompleteUrl('mele kalikimaka t shirt,');
        expect(url.origin + url.pathname).toBe('https://www.amazon.com/suggestions');
        expect(url.searchParams.get('prefix')).toBe('mele kalikimaka t shirt');
        expect(url.searchParams.getAll('suggestion-type')).toEqual(['WIDGET', 'KEYWORD']);
        expect(url.searchParams.get('site-variant')).toBe('desktop');
        expect(url.searchParams.get('version')).toBe('3');
        expect(url.searchParams.get('fb')).toBe('1');
        expect(url.searchParams.has('session-id')).toBe(false);
        expect(url.searchParams.has('request-id')).toBe(false);
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
});
