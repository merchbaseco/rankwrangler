import { describe, expect, it } from 'bun:test';
import { discoverSpApiKeyword } from './spapi-keyword-discovery';

const marketplaceId = 'ATVPDKIKX0DER';
const noAsinLookups = { searchCatalogItemsByAsins: () => Promise.resolve({ items: [] }) };

describe('SP-API keyword discovery', () => {
    it('retains continuation and normalizes listing evidence without requesting history', async () => {
        const requests: unknown[] = [];
        const result = await discoverSpApiKeyword(
            {
                scope: { kind: 'keyword', term: 'fishing shirt' },
                marketplaceId,
                pageToken: 'page-two',
            },
            {
                ...noAsinLookups,
                searchCatalogItemsByKeyword: input => {
                    requests.push(input);
                    return Promise.resolve({
                        items: [
                            {
                                asin: 'b0test0001',
                                summaries: [
                                    { marketplaceId, itemName: 'Fishing shirt', brand: 'Fish' },
                                ],
                                attributes: {
                                    bullet_point: [
                                        {
                                            value: 'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
                                        },
                                        { value: 'Gone fishing', marketplace_id: marketplaceId },
                                    ],
                                    part_number: [{ marketplace_id: marketplaceId }],
                                    list_price: [{ marketplace_id: marketplaceId }],
                                },
                                salesRanks: [
                                    {
                                        marketplaceId,
                                        displayGroupRanks: [
                                            { title: 'Clothing, Shoes & Jewelry', rank: 12_345 },
                                        ],
                                    },
                                ],
                            },
                            { asin: 'B0TEST0001' },
                            { asin: 'invalid' },
                            { asin: 'B0TEST0002' },
                        ],
                        pagination: { nextToken: 'page-three' },
                    });
                },
            }
        );
        expect(requests).toEqual([
            {
                keyword: 'fishing shirt',
                marketplaceId,
                pageSize: 20,
                maxAttempts: 1,
                priority: 'background',
                pageToken: 'page-two',
            },
        ]);
        expect(result.products.map(product => product.asin)).toEqual(['B0TEST0001', 'B0TEST0002']);
        expect(result.products[0]).toMatchObject({
            title: 'Fishing shirt',
            brand: 'Fish',
            isMerchListing: true,
            bullet1: 'Gone fishing',
            rootCategoryBsr: 12_345,
            keepa: null,
        });
        expect(result.nextPageToken).toBe('page-three');
        expect(result.products[1]).toMatchObject({ isMerchListing: false, keepa: null });
        expect(
            result.products.every(product => product.fetchedAt === result.observedAt.toISOString())
        ).toBe(true);
    });

    it('distinguishes a successful empty final page from malformed provider output', async () => {
        const input = {
            scope: { kind: 'keyword' as const, term: 'fishing' },
            marketplaceId,
        };
        const empty = await discoverSpApiKeyword(input, {
            ...noAsinLookups,
            searchCatalogItemsByKeyword: async () => ({ items: [] }),
        });
        expect(empty.products).toEqual([]);
        expect(empty.nextPageToken).toBeNull();
        await expect(
            discoverSpApiKeyword(input, {
                ...noAsinLookups,
                searchCatalogItemsByKeyword: async () => ({ pagination: {} }),
            })
        ).rejects.toThrow();
    });
    it('sends exact brand scope on every continuation request', async () => {
        const requests: unknown[] = [];
        await discoverSpApiKeyword(
            {
                scope: { kind: 'brand', term: 'shirt', brandName: 'Joy Haus' },
                marketplaceId,
                pageToken: 'brand-page-two',
            },
            {
                ...noAsinLookups,
                searchCatalogItemsByKeyword: async input => {
                    requests.push(input);
                    return { items: [] };
                },
            }
        );
        expect(requests).toEqual([
            {
                keyword: 'shirt',
                brandNames: ['Joy Haus'],
                marketplaceId,
                pageSize: 20,
                pageToken: 'brand-page-two',
                priority: 'background',
                maxAttempts: 1,
            },
        ]);
    });

    it('classifies a parent through its first child at background priority', async () => {
        const lookups: unknown[] = [];
        const result = await discoverSpApiKeyword(
            {
                scope: { kind: 'keyword', term: 'croquet tumbler' },
                marketplaceId,
                workId: 'receipt-id',
            },
            {
                searchCatalogItemsByKeyword: () =>
                    Promise.resolve({
                        items: [
                            {
                                asin: 'B0DHL1MRZ3',
                                summaries: [
                                    { marketplaceId, itemClassification: 'VARIATION_PARENT' },
                                ],
                                relationships: [
                                    {
                                        marketplaceId,
                                        relationships: [
                                            { type: 'VARIATION', childAsins: ['B0DHKV5N9T'] },
                                        ],
                                    },
                                ],
                                attributes: { bullet_point: [{ value: 'Croquet queen design' }] },
                            },
                        ],
                    }),
                searchCatalogItemsByAsins: input => {
                    lookups.push(input);
                    return Promise.resolve({
                        items: [
                            {
                                asin: 'B0DHKV5N9T',
                                attributes: {
                                    bullet_point: [
                                        { value: 'Croquet queen design' },
                                        {
                                            value: 'Dual wall insulated: keeps beverages hot or cold',
                                        },
                                    ],
                                    part_number: [{ marketplace_id: marketplaceId }],
                                    list_price: [{ marketplace_id: marketplaceId }],
                                },
                            },
                        ],
                    });
                },
            }
        );

        expect(lookups).toEqual([{ asins: ['B0DHKV5N9T'], marketplaceId, priority: 'background' }]);
        expect(result.products).toMatchObject([
            {
                asin: 'B0DHL1MRZ3',
                childAsin: 'B0DHKV5N9T',
                isMerchListing: true,
                bullet1: 'Croquet queen design',
                bullet2: null,
            },
        ]);
    });
});
