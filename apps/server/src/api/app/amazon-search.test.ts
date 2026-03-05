import { describe, expect, it } from 'bun:test';
import { buildAmazonSearchSyncQueueItems } from '@/api/app/amazon-search.js';

describe('buildAmazonSearchSyncQueueItems', () => {
    it('normalizes, deduplicates, and filters keyword search items for queueing', () => {
        const queueItems = buildAmazonSearchSyncQueueItems([
            {
                asin: 'b000123456',
                marketplaceId: 'ATVPDKIKX0DER',
                dateFirstAvailable: null,
                title: 'Shirt',
                brand: 'Brand',
                bullet1: null,
                bullet2: null,
                isMerchListing: false,
                rootCategoryBsr: null,
                thumbnailUrl: null,
                facets: [],
                lastFetched: '2026-03-04T00:00:00.000Z',
            },
            {
                asin: ' B000123456 ',
                marketplaceId: 'ATVPDKIKX0DER',
                dateFirstAvailable: null,
                title: 'Shirt',
                brand: 'Brand',
                bullet1: null,
                bullet2: null,
                isMerchListing: false,
                rootCategoryBsr: null,
                thumbnailUrl: null,
                facets: [],
                lastFetched: '2026-03-04T00:00:00.000Z',
            },
            {
                asin: 'B000987654',
                marketplaceId: 'A1F83G8C2ARO7P',
                dateFirstAvailable: null,
                title: 'Hoodie',
                brand: 'Brand',
                bullet1: null,
                bullet2: null,
                isMerchListing: true,
                rootCategoryBsr: 12345,
                thumbnailUrl: null,
                facets: [],
                lastFetched: '2026-03-04T00:00:00.000Z',
            },
            {
                asin: ' ',
                marketplaceId: 'ATVPDKIKX0DER',
                dateFirstAvailable: null,
                title: null,
                brand: null,
                bullet1: null,
                bullet2: null,
                isMerchListing: false,
                rootCategoryBsr: null,
                thumbnailUrl: null,
                facets: [],
                lastFetched: '2026-03-04T00:00:00.000Z',
            },
        ]);

        expect(queueItems).toEqual([
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B000123456',
            },
            {
                marketplaceId: 'A1F83G8C2ARO7P',
                asin: 'B000987654',
            },
        ]);
    });
});
