import { describe, it, expect } from 'bun:test';
import { parseAutocompleteSuggestions } from './keyword-autocomplete-provider';

describe('Amazon autocomplete boundary', () => {
    it('keeps actual keyword extensions, deduplicates and excludes seed/non-keyword/rewrites', () => {
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
            'hawaiian christmas cards',
        ]);
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
    });
});
