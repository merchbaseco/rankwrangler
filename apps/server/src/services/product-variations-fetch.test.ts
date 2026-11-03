import { afterEach, describe, expect, it, mock } from 'bun:test';
import * as eventLogs from './event-logs';
import { clearVariationDiscoveryCachesForTests } from './product-variations-discovery';
import {
    fetchClaimedVariationFamily,
    VARIATIONS_FAMILY_FETCH_DEADLINE_MS,
} from './product-variations-fetch';
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

    it('aborts between batches when the AbortSignal fires and records timing', async () => {
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
        expect(store.refreshLeaseCalls()).toBe(2);
        expect(eventLogs.createEventLogSafe).toHaveBeenCalledWith(
            expect.objectContaining({
                message: `Variation fetch timed out for ${PARENT}.`,
                detailsJson: expect.objectContaining({
                    outcome: 'aborted',
                    retryable: true,
                    batchesDone: 1,
                    batchesTotal: 2,
                    elapsedMs: expect.any(Number),
                    slowestBatchMs: expect.any(Number),
                }),
            })
        );
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
        const batchCount = Math.ceil(VARIATIONS_MAX_CHILDREN / 20);
        expect(searchCatalogItemsByAsins.mock.calls).toHaveLength(batchCount);
        expect(store.refreshLeaseCalls()).toBe(batchCount * 2);
        expect(VARIATIONS_FAMILY_FETCH_DEADLINE_MS).toBe(180_000);
    });

    it('warns with sample attribute keys when a theme dimension resolves for no children', async () => {
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
                    color: [{ value: 'Navy', marketplace_id: MARKETPLACE }],
                    fit_type: [{ value: 'Mens', marketplace_id: MARKETPLACE }],
                    shirt_size: [
                        {
                            size: 'medium',
                            size_class: 'alpha',
                            marketplace_id: MARKETPLACE,
                        },
                    ],
                    item_name: [{ value: 'Tee', marketplace_id: MARKETPLACE }],
                },
            })),
        }));
        const store = installStoreSpy();
        const claimId = '00000000-0000-0000-0000-00000000size';
        store.seedPending({ marketplaceId: MARKETPLACE, parentAsin: PARENT, claimId });

        const result = await fetchClaimedVariationFamily({
            marketplaceId: MARKETPLACE,
            parentAsin: PARENT,
            claimId,
            seed: {
                kind: 'parent',
                parentAsin: PARENT,
                theme: ['color', 'size', 'fit', 'style'],
                childAsins: [DEFAULT_CHILD],
            },
            deps,
        });

        expect(result.kind).toBe('ready');
        if (result.kind !== 'ready') {
            return;
        }
        expect(result.value.children[0]?.attributes).toEqual({
            color: 'Navy',
            size: 'M',
            fit: 'Mens',
        });
        expect(eventLogs.createEventLogSafe).toHaveBeenCalledWith(
            expect.objectContaining({
                level: 'warn',
                status: 'partial',
                message: `Variation theme attributes unresolved for ${PARENT}.`,
                detailsJson: {
                    unresolvedTheme: ['style'],
                    sampleAttributeKeys: ['color', 'fit_type', 'item_name', 'shirt_size'],
                },
            })
        );
    });
});
