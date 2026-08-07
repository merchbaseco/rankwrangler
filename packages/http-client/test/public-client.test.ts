import { afterEach, describe, expect, test } from 'bun:test';
import { createRankWranglerClient } from '../src/index';
import { productSearchInput } from './public-client.contract';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('public client contract', () => {
    test('calls a final public route with an OAuth bearer and composed API URL', async () => {
        let receivedRequest: Request | undefined;
        const productSearchOutput = { status: 'ready' };
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
