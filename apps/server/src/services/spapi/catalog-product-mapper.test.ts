import { describe, expect, it } from 'bun:test';
import { mapSpApiCatalogItem } from '@/services/spapi/catalog-product-mapper';

const US = 'ATVPDKIKX0DER';
const FETCHED_AT = '2026-10-28T12:00:00.000Z';

describe('mapSpApiCatalogItem', () => {
    it('maps a variant with its classification and family', () => {
        const mapped = mapSpApiCatalogItem(
            {
                asin: 'B0DHKV5N9T',
                summaries: [
                    {
                        marketplaceId: US,
                        itemName: 'Croquet Queen Gift Stainless Steel Insulated Tumbler',
                        brand: 'Croquet by Joy Haus',
                    },
                ],
                relationships: [
                    {
                        marketplaceId: US,
                        relationships: [{ type: 'VARIATION', parentAsins: ['B0DHL1MRZ3'] }],
                    },
                ],
                attributes: {
                    product_site_launch_date: [
                        { value: '2024-09-20T00:00:00Z', marketplace_id: US },
                    ],
                },
                salesRanks: [
                    {
                        marketplaceId: US,
                        displayGroupRanks: [{ title: 'Home & Kitchen', rank: 412_345 }],
                    },
                ],
            },
            US,
            FETCHED_AT,
            { isMerchListing: true, bullet1: 'Croquet queen design', bullet2: null }
        );

        expect(mapped).toEqual({
            asin: 'B0DHKV5N9T',
            parentAsin: 'B0DHL1MRZ3',
            childAsin: null,
            marketplaceId: US,
            dateFirstAvailable: '2024-09-20',
            title: 'Croquet Queen Gift Stainless Steel Insulated Tumbler',
            brand: 'Croquet by Joy Haus',
            isMerchListing: true,
            bullet1: 'Croquet queen design',
            bullet2: null,
            rootCategoryId: 1_055_398,
            rootCategoryBsr: 412_345,
            thumbnailUrl: null,
            keepa: null,
            fetchedAt: FETCHED_AT,
        });
    });
});
