import { describe, expect, it } from 'bun:test';
import { normalizeFacetCategoryTotals } from '@/services/product-facet-metrics.js';

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
