import { describe, expect, it } from 'bun:test';
import { mapCatalogItemFromKeywordSearch } from '@/services/spapi/search-catalog-items-by-keyword.js';

describe('mapCatalogItemFromKeywordSearch', () => {
    it('maps a Catalog Item into a products-table row shape', () => {
        const mapped = mapCatalogItemFromKeywordSearch(
            {
                asin: 'B000123456',
                attributes: {
                    product_site_launch_date: [
                        {
                            marketplace_id: 'ATVPDKIKX0DER',
                            value: '2025-02-11T10:00:00Z',
                        },
                    ],
                    bullet_point: [
                        {
                            value: 'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
                            marketplace_id: 'ATVPDKIKX0DER',
                        },
                        {
                            value: 'Funny St. Patrick\'s Day design for women and men',
                            marketplace_id: 'ATVPDKIKX0DER',
                        },
                    ],
                },
                salesRanks: [
                    {
                        marketplaceId: 'ATVPDKIKX0DER',
                        displayGroupRanks: [
                            {
                                rank: 11234,
                                title: 'Clothing, Shoes & Jewelry',
                            },
                        ],
                    },
                ],
                images: [
                    {
                        marketplaceId: 'ATVPDKIKX0DER',
                        images: [
                            {
                                variant: 'MAIN',
                                link: 'https://images.example.com/main.jpg',
                            },
                        ],
                    },
                ],
                summaries: [
                    {
                        marketplaceId: 'ATVPDKIKX0DER',
                        itemName: 'Funny St. Patrick\'s Day Shirt',
                        brand: 'RankWrangler',
                    },
                ],
            },
            'ATVPDKIKX0DER',
            '2026-03-04T20:10:00.000Z'
        );

        expect(mapped).toEqual({
            asin: 'B000123456',
            marketplaceId: 'ATVPDKIKX0DER',
            dateFirstAvailable: '2025-02-11',
            title: "Funny St. Patrick's Day Shirt",
            brand: 'RankWrangler',
            bullet1: 'Funny St. Patrick\'s Day design for women and men',
            bullet2: null,
            isMerchListing: true,
            rootCategoryBsr: 11234,
            thumbnailUrl: 'https://images.example.com/main.jpg',
            facets: [],
            lastFetched: '2026-03-04T20:10:00.000Z',
        });
    });
});
