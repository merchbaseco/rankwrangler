import { describe, expect, it, mock } from 'bun:test';
import { searchKeepaCatalog } from './keepa-catalog-search';
import { getKeepaProviderPriority } from './keepa';

const recording = await Bun.file(
    new URL('../../test/fixtures/keepa-catalog-search/retro-gardening-shirt.json', import.meta.url)
).json();

describe('Keepa Catalog search adapter', () => {
    it('orders interactive Catalog, scheduled Catalog, then Product refresh work', () => {
        expect(getKeepaProviderPriority('interactiveCatalog')).toBeLessThan(
            getKeepaProviderPriority('scheduledCatalog')
        );
        expect(getKeepaProviderPriority('scheduledCatalog')).toBeLessThan(
            getKeepaProviderPriority('manualProduct')
        );
        expect(getKeepaProviderPriority('manualProduct')).toBeLessThan(
            getKeepaProviderPriority('scheduledProduct')
        );
    });

    it('replays Product Search through the production boundary in one bounded request', async () => {
        const fetchImpl = mock(async () => Response.json(recording.response));

        const result = await searchKeepaCatalog(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                term: recording.request.term,
                priority: 'interactive',
            },
            {
                apiKey: 'recording-key',
                fetchImpl,
                scheduleRequest: async (_priority, request) => await request(),
                recordUsage: () => {},
            }
        );

        expect(fetchImpl.mock.calls).toHaveLength(1);
        const requestUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
        expect(requestUrl.pathname).toBe('/search');
        expect(Object.fromEntries(requestUrl.searchParams)).toMatchObject({
            domain: '1',
            type: 'product',
            term: recording.request.term,
            page: '0',
            'asins-only': '0',
            stats: '365',
            history: '1',
        });
        expect(result.products).toHaveLength(2);
        expect(result.products[0]?.asin).toBe('B0MERCH001');
        expect(result.products[0]?.csv?.[3]).toEqual([5_000_900, 60_000, 5_001_000, 54_321]);
        expect(result.internalUsage.tokensConsumed).toBe(10);
    });

    it('never returns more than twenty Product payloads from the first page', async () => {
        const products = Array.from({ length: 25 }, (_, index) => ({
            asin: `B${String(index).padStart(9, '0')}`,
        }));

        const result = await searchKeepaCatalog(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                term: 'bounded',
                priority: 'interactive',
            },
            {
                apiKey: 'recording-key',
                fetchImpl: mock(async () => Response.json({ products })),
                scheduleRequest: async (_priority, request) => await request(),
                recordUsage: () => {},
            }
        );

        expect(result.products).toHaveLength(20);
    });

    it('preserves interactive and scheduled Catalog priority at the shared Keepa limiter', async () => {
        const scheduleRequest = mock(
            async (_priority: 'interactiveCatalog' | 'scheduledCatalog', request: () => Promise<Response>) =>
                await request()
        );

        await searchKeepaCatalog(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                term: 'priority',
                priority: 'scheduled',
            },
            {
                apiKey: 'recording-key',
                fetchImpl: mock(async () => Response.json({ products: [] })),
                scheduleRequest,
                recordUsage: () => {},
            }
        );

        expect(scheduleRequest.mock.calls[0]?.[0]).toBe('scheduledCatalog');
    });
});
