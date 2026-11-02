import { afterEach, describe, expect, it, mock } from 'bun:test';
import { clearVariationDiscoveryCachesForTests } from './product-variations-discovery';
import { fetchClaimedVariationFamily } from './product-variations-fetch';
import { VARIATIONS_MAX_CHILDREN } from './product-variations-parse';
import {
    createCatalogMock,
    DEFAULT_CHILD,
    installStoreSpy,
    MARKETPLACE,
    PARENT,
} from './product-variations-test-fixtures';

describe('fetchClaimedVariationFamily', () => {
    afterEach(() => {
        mock.restore();
        clearVariationDiscoveryCachesForTests();
    });

    it('aborts between batches when the AbortSignal fires and fails the claim', async () => {
        const manyChildren = [
            DEFAULT_CHILD,
            ...Array.from({ length: 39 }, (_, index) => `B0ABORT${String(index + 2).padStart(3, '0')}`),
        ];
        const { deps, searchCatalogItemsByAsins } = createCatalogMock();
        const controller = new AbortController();
        let childBatches = 0;
        searchCatalogItemsByAsins.mockImplementation(async ({ asins }) => {
            if (!asins.includes(PARENT)) {
                childBatches += 1;
                if (childBatches === 1) {
                    controller.abort();
                }
            }
            return {
                items: asins.map(asin => ({
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
                })),
            };
        });
        const store = installStoreSpy();
        const claimId = '00000000-0000-0000-0000-00000000ab01';
        store.seedPending({ marketplaceId: MARKETPLACE, parentAsin: PARENT, claimId });

        const result = await fetchClaimedVariationFamily({
            marketplaceId: MARKETPLACE,
            parentAsin: PARENT,
            claimId,
            seed: {
                kind: 'parent',
                parentAsin: PARENT,
                theme: ['color'],
                childAsins: manyChildren,
            },
            deps,
            signal: controller.signal,
        });

        expect(result.kind).toBe('aborted');
        expect(childBatches).toBe(1);
        expect(store.getRow(MARKETPLACE, PARENT)?.state).toBe('error');
    });

    it('stores every Amazon child as a member while capping attribute Catalog lookups', async () => {
        const manyChildren = Array.from(
            { length: VARIATIONS_MAX_CHILDREN + 3 },
            (_, index) => `B0CAP${String(index + 1).padStart(5, '0')}`
        );
        const { deps, searchCatalogItemsByAsins } = createCatalogMock();
        searchCatalogItemsByAsins.mockImplementation(async ({ asins }) => ({
            items: asins.map(asin => ({
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
            })),
        }));
        const store = installStoreSpy();
        const claimId = '00000000-0000-0000-0000-00000000cap1';
        store.seedPending({ marketplaceId: MARKETPLACE, parentAsin: PARENT, claimId });

        const result = await fetchClaimedVariationFamily({
            marketplaceId: MARKETPLACE,
            parentAsin: PARENT,
            claimId,
            seed: {
                kind: 'parent',
                parentAsin: PARENT,
                theme: ['color'],
                childAsins: manyChildren,
            },
            deps,
        });

        expect(result.kind).toBe('ready');
        if (result.kind !== 'ready') {
            return;
        }
        expect(result.value.children).toHaveLength(VARIATIONS_MAX_CHILDREN + 3);
        expect(result.value.defaultChildAsin).toBe(manyChildren[0]);
        expect(result.value.children[0]?.attributes).toEqual({ color: 'Black' });
        expect(result.value.children.at(-1)?.attributes).toEqual({});
        expect(store.getRow(MARKETPLACE, PARENT)?.memberAsins).toHaveLength(
            VARIATIONS_MAX_CHILDREN + 4
        );
        expect(searchCatalogItemsByAsins.mock.calls).toHaveLength(
            Math.ceil(VARIATIONS_MAX_CHILDREN / 20)
        );
    });
});
