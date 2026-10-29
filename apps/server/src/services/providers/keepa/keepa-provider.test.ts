import { describe, expect, it, mock } from 'bun:test';
import type { captureProviderAttempt, ProviderAttemptDescriptor } from '../provider-telemetry';
import type { KeepaCapacity } from './keepa-capacity-types';
import { KeepaProvider } from './keepa-provider';
import type { KeepaResponse } from './keepa-provider-types';

const capacity: KeepaCapacity = {
    enqueue: async () => 'test',
    cancel: () => Promise.resolve(),
    reserve: () => Promise.resolve(),
    settle: () => Promise.resolve(),
};

describe('KeepaProvider', () => {
    it('maps Catalog search to one normalized Provider attempt', async () => {
        const descriptors: ProviderAttemptDescriptor[] = [];
        const fetchImpl = mock(async () => Response.json({ products: [] }));
        const capture = (async (descriptor, run) => {
            descriptors.push(descriptor);
            return await run();
        }) as typeof captureProviderAttempt;
        const provider = new KeepaProvider({
            capacity,
            apiKey: 'keepa-test-key',
            capture,
            fetchImpl,
        });

        const result: KeepaResponse = await provider.searchCatalog({
            marketplaceId: 'ATVPDKIKX0DER',
            term: 'retro gardening shirt',
            priority: 'interactiveCatalog',
        });

        expect(result.products).toEqual([]);
        expect(descriptors).toEqual([
            { provider: 'keepa', operation: 'keepa.token' },
            { provider: 'keepa', operation: 'keepa.catalog.search' },
        ]);
        const url = new URL(String(fetchImpl.mock.calls[1]?.[0]));
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
            capacity,
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

describe('Keepa physical attempt guard', () => {
    it('settles malformed and lost responses as unknown spend', async () => {
        const settlements: unknown[] = [];
        const provider = new KeepaProvider({
            apiKey: 'test',
            capture: (async (_descriptor, run) => await run()) as typeof captureProviderAttempt,
            capacity: {
                ...capacity,
                settle: (_id, usage) => {
                    settlements.push(usage);
                    return Promise.resolve();
                },
            },
            fetchImpl: mock(async () => new Response('not-json')),
        });
        await expect(
            provider.getCategories({ marketplaceId: 'ATVPDKIKX0DER', categoryIds: [1] })
        ).rejects.toThrow();
        expect(settlements).toEqual([null, null]);
    });
    it('settles successful empty results using actual response cost', async () => {
        const requests: unknown[] = [];
        const settlements: unknown[] = [];
        const provider = new KeepaProvider({
            apiKey: 'test',
            capture: (async (_descriptor, run) => await run()) as typeof captureProviderAttempt,
            capacity: {
                ...capacity,
                enqueue: request => {
                    requests.push(request);
                    return Promise.resolve('id');
                },
                settle: (_id, usage) => {
                    settlements.push(usage);
                    return Promise.resolve();
                },
            },
            fetchImpl: mock(async (input: Parameters<typeof fetch>[0]) =>
                Response.json(
                    new URL(String(input)).pathname === '/token'
                        ? { tokensLeft: 1200, refillRate: 20, refillIn: 60_000 }
                        : {
                              products: [],
                              tokensConsumed: 10,
                              tokensLeft: 1190,
                              refillRate: 20,
                              refillIn: 59_000,
                          }
                )
            ),
        });
        await provider.searchCatalog({
            marketplaceId: 'ATVPDKIKX0DER',
            term: 'fishing',
            priority: 'scheduledCatalog',
            workClass: 'discovery',
            page: 0,
        });
        expect(requests).toEqual([
            {
                operation: 'search',
                workClass: 'discovery',
                keywordId: undefined,
                workId: undefined,
            },
            { operation: 'token', workClass: 'interactive' },
        ]);
        expect(settlements[1]).toEqual({
            tokensConsumed: 10,
            tokensLeft: 1190,
            refillRate: 20,
            refillIn: 59_000,
        });
    });
    it('never calls the paid endpoint when the gate defers', async () => {
        const fetchImpl = mock(async () =>
            Response.json({ tokensLeft: 1200, refillRate: 20, refillIn: 60_000 })
        );
        let reservations = 0;
        const provider = new KeepaProvider({
            apiKey: 'test',
            fetchImpl,
            capture: (async (_descriptor, run) => await run()) as typeof captureProviderAttempt,
            capacity: {
                ...capacity,
                reserve: () => {
                    if (++reservations > 1) {
                        return Promise.reject(new Error('deferred'));
                    }
                    return Promise.resolve();
                },
            },
        });
        await expect(
            provider.getProduct({
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B09CP2LR25',
                days: 365,
                priority: 'scheduledProduct',
            })
        ).rejects.toThrow('deferred');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
