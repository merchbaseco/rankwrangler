import { afterEach, describe, expect, test } from 'bun:test';
import { createRankWranglerClient } from '../src/index';
import { productSummaryInput, productSummaryOutput } from './product-summary.contract';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('Product summary client contract', () => {
    test('calls the typed public route with an OAuth bearer and composed API URL', async () => {
        let receivedRequest: Request | undefined;
        globalThis.fetch = (request, init) => {
            receivedRequest = new Request(request, init);
            return Promise.resolve(Response.json({ result: { data: productSummaryOutput } }));
        };
        const client = createRankWranglerClient({
            baseUrl: 'https://rankwrangler.merchbase.co///',
            headers: {
                Authorization: 'Bearer clerk_oauth_test',
            },
            batch: false,
        });

        const result = await client.product.getSummary.mutate(productSummaryInput);

        expect(result).toEqual(productSummaryOutput);
        expect(receivedRequest?.url).toBe(
            'https://rankwrangler.merchbase.co/api/api.public.product.getSummary'
        );
        expect(receivedRequest?.headers.get('authorization')).toBe('Bearer clerk_oauth_test');
        expect(await receivedRequest?.json()).toEqual(productSummaryInput);
    });
});
