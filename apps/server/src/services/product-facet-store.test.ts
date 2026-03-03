import { describe, expect, it } from 'bun:test';
import { flattenClassification, normalizeFacetValue } from '@/services/product-facet-store.js';

describe('normalizeFacetValue', () => {
    it('normalizes casing, punctuation, and spaces to kebab-case', () => {
        expect(normalizeFacetValue("  K-Pop Vibes!  ")).toBe('k-pop-vibes');
        expect(normalizeFacetValue('Teacher & Coach')).toBe('teacher-and-coach');
    });

    it('returns null for empty/invalid values', () => {
        expect(normalizeFacetValue('   ')).toBeNull();
        expect(normalizeFacetValue('---')).toBeNull();
    });
});

describe('flattenClassification', () => {
    it('deduplicates within facet categories after normalization', () => {
        const entries = flattenClassification({
            profession: [],
            hobby: [],
            animal: ['Corgis', 'corgis', ' Corgis '],
            food: [],
            cause: [],
            identity: [],
            culture: ['K-Pop', 'k-pop'],
            holiday: [],
            occasion: [],
            place: [],
            'party-theme': [],
        });

        expect(entries).toEqual([
            { facet: 'animal', name: 'corgis' },
            { facet: 'culture', name: 'k-pop' },
        ]);
    });
});
