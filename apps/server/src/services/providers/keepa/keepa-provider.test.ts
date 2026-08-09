import { describe, expect, it, mock } from 'bun:test';
import type { captureProviderAttempt, ProviderAttemptDescriptor } from '../provider-telemetry';
import { KeepaProvider } from './keepa-provider';
import type { KeepaResponse } from './keepa-provider-types';

describe('KeepaProvider', () => {
    it('maps Catalog search to one normalized Provider attempt', async () => {
        const descriptors: ProviderAttemptDescriptor[] = [];
        const fetchImpl = mock(async () => Response.json({ products: [] }));
        const capture = (async (descriptor, run) => {
            descriptors.push(descriptor);
            return await run();
        }) as typeof captureProviderAttempt;
        const provider = new KeepaProvider({ apiKey: 'keepa-test-key', capture, fetchImpl });

        const result: KeepaResponse = await provider.searchCatalog({
            marketplaceId: 'ATVPDKIKX0DER',
            term: 'retro gardening shirt',
            priority: 'interactiveCatalog',
        });

        expect(result.products).toEqual([]);
        expect(descriptors).toEqual([{ provider: 'keepa', operation: 'keepa.catalog.search' }]);
        const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
        expect(url.pathname).toBe('/search');
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
            key: 'keepa-test-key',
            domain: '1',
            type: 'product',
            term: 'retro gardening shirt',
        });
    });

    it('keeps token capacity from failed Keepa responses', async () => {
        const capture = (async (_descriptor, run) => await run()) as typeof captureProviderAttempt;
        const provider = new KeepaProvider({
            apiKey: 'keepa-test-key',
            capture,
            fetchImpl: mock(async () =>
                Response.json(
                    {
                        error: { code: 'NOT_ENOUGH_TOKEN', message: 'Insufficient tokens' },
                        tokensLeft: 7,
                    },
                    { status: 429 }
                )
            ),
        });

        await expect(
            provider.searchCatalog({
                marketplaceId: 'ATVPDKIKX0DER',
                term: 'capacity test',
                priority: 'interactiveCatalog',
            })
        ).rejects.toThrow('Insufficient tokens');
        expect(provider.getRuntimeTokenState().tokensLeft).toBe(7);
    });
});
