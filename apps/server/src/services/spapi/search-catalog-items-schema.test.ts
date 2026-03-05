import { describe, expect, it } from 'bun:test';
import { ItemSearchResultsSchema } from '@/services/spapi/search-catalog-items-schema.js';

describe('ItemSearchResultsSchema', () => {
    it('accepts an explicit empty items array', () => {
        const parsed = ItemSearchResultsSchema.parse({
            items: [],
        });

        expect(parsed).toEqual({
            items: [],
        });
    });

    it('rejects payloads with missing items', () => {
        expect(() =>
            ItemSearchResultsSchema.parse({
                pagination: {},
            })
        ).toThrow();
    });
});
