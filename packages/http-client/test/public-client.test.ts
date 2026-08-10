import { afterEach, describe, expect, test } from 'bun:test';
import { createRankWranglerClient } from '../src/index';
import { productSearchInput } from './public-client.contract';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('public client contract', () => {
    test('calls a public Product Search route with an OAuth bearer and composed API URL', async () => {
        let receivedRequest: Request | undefined;
        const productSearchOutput = {
            keyword: 'retro gardening shirt',
            searchedAt: '2026-08-06T12:00:00.000Z',
            results: [
                {
                    organicSearchPlacement: 3,
                    product: {
                        marketplaceId: 'ATVPDKIKX0DER',
                        asin: 'B012345678',
                        title: 'Garden shirt',
                        brand: 'Example brand',
                        thumbnail: {
                            status: 'available' as const,
                            url: 'https://example.com/image.jpg',
                        },
                        isMerchListing: null,
                        amazonListingStatus: 'active',
                        category: null,
                        salesRank: null,
                        price: null,
                        boughtInPastMonth: null,
                    },
                },
            ],
        };
        globalThis.fetch = (request, init) => {
            receivedRequest = new Request(request, init);
            return Promise.resolve(Response.json({ result: { data: productSearchOutput } }));
        };
        const client = createRankWranglerClient({
            baseUrl: 'https://rankwrangler.merchbase.co///',
            headers: {
                Authorization: 'Bearer clerk_oauth_test',
            },
            batch: false,
        });

        const result = await client.product.search.mutate(productSearchInput);

        expect(result).toEqual(productSearchOutput);
        expect(receivedRequest?.url).toBe(
            'https://rankwrangler.merchbase.co/api/api.public.product.search'
        );
        expect(receivedRequest?.headers.get('authorization')).toBe('Bearer clerk_oauth_test');
        expect(await receivedRequest?.json()).toEqual(productSearchInput);
    });
});
