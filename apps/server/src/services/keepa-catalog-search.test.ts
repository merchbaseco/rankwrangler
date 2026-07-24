import { describe, expect, it, mock } from 'bun:test';
import { searchKeepaCatalog } from './keepa-catalog-search';

const recording = await Bun.file(
    new URL('../../test/fixtures/keepa-catalog-search/retro-gardening-shirt.json', import.meta.url)
).json();

describe('Keepa Catalog search adapter', () => {
    it('replays Product Search through the production boundary in one bounded request', async () => {
        const fetchImpl = mock(async () => Response.json(recording.response));

        const result = await searchKeepaCatalog(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                term: recording.request.term,
            },
            {
                apiKey: 'recording-key',
                fetchImpl,
                scheduleRequest: async request => await request(),
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
            { marketplaceId: 'ATVPDKIKX0DER', term: 'bounded' },
            {
                apiKey: 'recording-key',
                fetchImpl: mock(async () => Response.json({ products })),
                scheduleRequest: async request => await request(),
                recordUsage: () => {},
            }
        );

        expect(result.products).toHaveLength(20);
    });
});
