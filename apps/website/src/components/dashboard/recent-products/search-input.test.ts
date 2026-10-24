import { describe, expect, it } from 'bun:test';
import { buildSearchInput } from './search-input';

const filters = { bsrRange: null, marketplaceIds: [], lastUpdated: 'all' } as const;

describe('dashboard catalog search', () => {
    it('sends catalog filters and sorting to the server across every page', () => {
        const input = buildSearchInput({
            activeFacetKeys: ['theme:fishing:trout'],
            filters: {
                bsrRange: [100, 300_000],
                marketplaceIds: ['ATVPDKIKX0DER', 'A1F83G8C2ARO7P'],
                lastUpdated: '24h',
            },
            searchValue: '  fishing shirt  ',
            sorting: [{ id: 'rootCategoryBsr', desc: false }],
            now: Date.parse('2026-10-23T12:00:00Z'),
        });
        expect(input).toEqual({
            term: 'fishing shirt',
            marketplaceIds: ['ATVPDKIKX0DER', 'A1F83G8C2ARO7P'],
            isMerchListing: 'all',
            amazonListingStatus: 'all',
            includeOfficialBrands: true,
            salesRank: { min: 100, max: 300_000 },
            updatedAt: { after: '2026-10-22T12:00:00.000Z' },
            facets: [{ facet: 'theme', name: 'fishing:trout' }],
            sort: 'salesRankAsc',
            limit: 50,
        });
    });

    it('browses every marketplace without requiring a text query', () => {
        const input = buildSearchInput({
            activeFacetKeys: [],
            filters: { ...filters, marketplaceIds: [] },
            searchValue: ' ', sorting: [], now: 0,
        });
        expect(input.term).toBeUndefined();
        expect(input.marketplaceIds).toEqual([]);
        expect(input.updatedAt).toBeUndefined();
        expect(input.sort).toBe('updatedAtDesc');
    });
});
