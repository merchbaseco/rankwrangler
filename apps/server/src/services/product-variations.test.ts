import { afterEach, describe, expect, it, mock } from 'bun:test';
import { VARIATIONS_MEMBER_REFRESH_MS } from '@/db/product/product-variation-store';
import {
    clearVariationDiscoveryCachesForTests,
    getProductVariations,
    VARIATIONS_RESOLVE_GRACE_MS,
} from './product-variations';
import { VARIATIONS_DISCOVERY_ERROR_COOLDOWN_MS } from './product-variations-discovery';
import {
    catalogItemFor,
    createCatalogMock,
    DEFAULT_CHILD,
    installStoreSpy,
    MARKETPLACE,
    ORPHAN_CHILD,
    PARENT,
    SECOND_CHILD,
} from './product-variations-test-fixtures';

describe('getProductVariations', () => {
    afterEach(() => {
        mock.restore();
        clearVariationDiscoveryCachesForTests();
    });

    it('returns a family when the requested ASIN is the variation parent', async () => {
        const { deps, searchCatalogItemsByAsins } = createCatalogMock();
        searchCatalogItemsByAsins.mockImplementation(async ({ asins }) => ({
            items: asins.map(asin => catalogItemFor(asin)),
        }));
        installStoreSpy();

        const result = await getProductVariations(
            { marketplaceId: MARKETPLACE, asin: PARENT, timeoutMs: 5000 },
            deps
        );

        expect(result).toMatchObject({
            parentAsin: PARENT,
            theme: ['color', 'size'],
            defaultChildAsin: DEFAULT_CHILD,
            children: [
                { asin: DEFAULT_CHILD, attributes: { color: 'Black', size: 'Large' } },
                { asin: SECOND_CHILD, attributes: { color: 'White', size: 'Medium' } },
            ],
        });
        expect(result?.fetchedAt).toEqual(expect.any(String));
    });

    it('discovers the parent when the request starts on a child ASIN', async () => {
        const { deps, searchCatalogItemsByAsins } = createCatalogMock();
        searchCatalogItemsByAsins.mockImplementation(async ({ asins }) => ({
            items: asins.map(asin => catalogItemFor(asin)),
        }));
        installStoreSpy();

        const result = await getProductVariations(
            { marketplaceId: MARKETPLACE, asin: DEFAULT_CHILD, timeoutMs: 5000 },
            deps
        );

        expect(result?.parentAsin).toBe(PARENT);
        expect(result?.defaultChildAsin).toBe(DEFAULT_CHILD);
    });

    it('returns null for a standalone Product', async () => {
        const { deps, searchCatalogItemsByAsins } = createCatalogMock();
        searchCatalogItemsByAsins.mockResolvedValue({
            items: [{ asin: 'B0STANDALN', relationships: [] }],
        });
        installStoreSpy();

        const result = await getProductVariations(
            { marketplaceId: MARKETPLACE, asin: 'B0STANDALN', timeoutMs: 5000 },
            deps
        );

        expect(result).toBeNull();
    });

    it('returns null quickly when a fresh parent family omits the requested child', async () => {
        const { deps, searchCatalogItemsByAsins } = createCatalogMock();
        searchCatalogItemsByAsins.mockImplementation(async ({ asins }) => ({
            items: asins.map(asin =>
                asin === ORPHAN_CHILD
                    ? {
                          asin: ORPHAN_CHILD,
                          relationships: [
                              {
                                  marketplaceId: MARKETPLACE,
                                  relationships: [{ type: 'VARIATION', parentAsins: [PARENT] }],
                              },
                          ],
                      }
                    : catalogItemFor(asin)
            ),
        }));
        const store = installStoreSpy();
        store.seedReadyFamily({
            marketplaceId: MARKETPLACE,
            parentAsin: PARENT,
            children: [
                { asin: DEFAULT_CHILD, attributes: { color: 'Black', size: 'Large' } },
                { asin: SECOND_CHILD, attributes: { color: 'White', size: 'Medium' } },
            ],
            fetchedAt: new Date(),
        });

        const started = Date.now();
        const result = await getProductVariations(
            { marketplaceId: MARKETPLACE, asin: ORPHAN_CHILD, timeoutMs: 400 },
            deps
        );

        expect(result).toBeNull();
        expect(Date.now() - started).toBeLessThan(VARIATIONS_RESOLVE_GRACE_MS);
        expect(searchCatalogItemsByAsins.mock.calls.length).toBeLessThan(5);
    });

    it('refetches once when an older parent family omits the requested child', async () => {
        const { deps, searchCatalogItemsByAsins } = createCatalogMock();
        searchCatalogItemsByAsins.mockImplementation(async ({ asins }) => ({
            items: asins.map(asin =>
                asin === ORPHAN_CHILD
                    ? {
                          asin: ORPHAN_CHILD,
                          relationships: [
                              {
                                  marketplaceId: MARKETPLACE,
                                  relationships: [{ type: 'VARIATION', parentAsins: [PARENT] }],
                              },
                          ],
                          attributes: {
                              color: [{ value: 'Red', marketplace_id: MARKETPLACE }],
                              size: [{ value: 'S', marketplace_id: MARKETPLACE }],
                          },
                      }
                    : asin === PARENT
                      ? {
                            asin: PARENT,
                            relationships: [
                                {
                                    marketplaceId: MARKETPLACE,
                                    relationships: [
                                        {
                                            type: 'VARIATION',
                                            childAsins: [DEFAULT_CHILD, ORPHAN_CHILD],
                                            variationTheme: {
                                                attributes: ['COLOR_NAME', 'SIZE_NAME'],
                                            },
                                        },
                                    ],
                                },
                            ],
                        }
                      : catalogItemFor(asin)
            ),
        }));
        const store = installStoreSpy();
        store.seedReadyFamily({
            marketplaceId: MARKETPLACE,
            parentAsin: PARENT,
            children: [{ asin: DEFAULT_CHILD, attributes: { color: 'Black', size: 'Large' } }],
            fetchedAt: new Date(Date.now() - VARIATIONS_MEMBER_REFRESH_MS - 1_000),
        });

        const result = await getProductVariations(
            { marketplaceId: MARKETPLACE, asin: ORPHAN_CHILD, timeoutMs: 5000 },
            deps
        );

        expect(result?.defaultChildAsin).toBe(DEFAULT_CHILD);
        expect(result?.children.map(child => child.asin)).toEqual([DEFAULT_CHILD, ORPHAN_CHILD]);
        expect(result?.children[1]?.attributes).toEqual({ color: 'Red', size: 'S' });
    });

    it('backs off discovery after a Catalog error instead of hammering SP-API', async () => {
        const { deps, searchCatalogItemsByAsins } = createCatalogMock();
        searchCatalogItemsByAsins.mockRejectedValue(new Error('catalog down'));
        installStoreSpy();

        const first = await getProductVariations(
            { marketplaceId: MARKETPLACE, asin: PARENT, timeoutMs: 500 },
            deps
        );
        const second = await getProductVariations(
            { marketplaceId: MARKETPLACE, asin: PARENT, timeoutMs: 500 },
            deps
        );

        expect(first).toBeNull();
        expect(second).toBeNull();
        expect(searchCatalogItemsByAsins).toHaveBeenCalledTimes(1);
        expect(VARIATIONS_DISCOVERY_ERROR_COOLDOWN_MS).toBeGreaterThan(0);
    });

    it('runs the first child batch in foreground and later batches in background', async () => {
        const manyChildren = [
            DEFAULT_CHILD,
            ...Array.from({ length: 39 }, (_, index) => `B0BATCH${String(index + 2).padStart(3, '0')}`),
        ];
        const { deps, searchCatalogItemsByAsins } = createCatalogMock();
        searchCatalogItemsByAsins.mockImplementation(async ({ asins }) => ({
            items: asins.map(asin =>
                asin === PARENT
                    ? {
                          asin: PARENT,
                          relationships: [
                              {
                                  marketplaceId: MARKETPLACE,
                                  relationships: [
                                      {
                                          type: 'VARIATION',
                                          childAsins: manyChildren,
                                          variationTheme: { attributes: ['color'] },
                                      },
                                  ],
                              },
                          ],
                      }
                    : {
                          asin,
                          relationships: [
                              {
                                  marketplaceId: MARKETPLACE,
                                  relationships: [{ type: 'VARIATION', parentAsins: [PARENT] }],
                              },
                          ],
                          attributes: {
                              color: [{ value: 'Black', marketplace_id: MARKETPLACE }],
                          },
                      }
            ),
        }));
        installStoreSpy();

        await getProductVariations(
            { marketplaceId: MARKETPLACE, asin: PARENT, timeoutMs: 10_000 },
            deps
        );

        const childBatchCalls = searchCatalogItemsByAsins.mock.calls.filter(
            call => !call[0].asins.includes(PARENT)
        );
        expect(childBatchCalls.length).toBe(2);
        expect(childBatchCalls[0]?.[0].priority).toBe('foreground');
        expect(childBatchCalls[1]?.[0].priority).toBe('background');
    });
});
