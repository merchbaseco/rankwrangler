import { describe, expect, it } from 'bun:test';
import {
    getFacetMetricsWindowStart,
    normalizeFacetCategoryTotals,
} from '@/services/product-facet-metrics.js';

describe('normalizeFacetCategoryTotals', () => {
    it('returns all facet categories with zeros when no rows exist', () => {
        const result = normalizeFacetCategoryTotals([]);

        expect(result).toHaveLength(11);
        expect(result.every(row => row.productCount === 0)).toBe(true);
    });

    it('maps known facet counts and ignores unknown facets', () => {
        const result = normalizeFacetCategoryTotals([
            { facet: 'hobby', product_count: 12 },
            { facet: 'party-theme', product_count: 4 },
            { facet: 'not-a-facet', product_count: 999 },
        ]);

        expect(result.find(row => row.facet === 'hobby')?.productCount).toBe(12);
        expect(result.find(row => row.facet === 'party-theme')?.productCount).toBe(4);
        expect(result.every(row => row.productCount < 999)).toBe(true);
    });
});

describe('getFacetMetricsWindowStart', () => {
    it('returns a 24-hour rolling window start', () => {
        const now = new Date('2026-03-03T16:44:00.000Z');
        const result = getFacetMetricsWindowStart(now);

        expect(result.toISOString()).toBe('2026-03-02T16:44:00.000Z');
    });
});
