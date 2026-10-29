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
        const productSearchOutput = { items: [], nextCursor: null, coverage: null };
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

        const result = await client.product.search.query(productSearchInput);

        expect(result).toEqual(productSearchOutput);
        const url = new URL(receivedRequest?.url ?? '');
        expect(url.pathname).toBe('/api/api.public.product.search');
        expect(receivedRequest?.method).toBe('GET');
        expect(JSON.parse(url.searchParams.get('input') ?? '')).toEqual(productSearchInput);
        expect(receivedRequest?.headers.get('authorization')).toBe('Bearer clerk_oauth_test');
    });
});
