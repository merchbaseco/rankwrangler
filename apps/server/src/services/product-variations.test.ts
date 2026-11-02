import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as variationStore from '@/db/product/product-variation-store';
import {
    VARIATIONS_GENERATOR_VERSION,
    type StoredVariationRow,
} from '@/db/product/product-variation-store';
import * as eventLogs from './event-logs';
import { getProductVariations, type VariationDeps } from './product-variations';

const MARKETPLACE = 'ATVPDKIKX0DER';
const PARENT = 'B0GHTD7TKB';
const DEFAULT_CHILD = 'B0GHT1WYPY';
const SECOND_CHILD = 'B0GHT00002';

describe('getProductVariations', () => {
    afterEach(() => {
        mock.restore();
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
            theme: ['color_name', 'size_name'],
            defaultChildAsin: DEFAULT_CHILD,
            children: [
                { asin: DEFAULT_CHILD, attributes: { color: 'Black', size: 'Large' } },
                { asin: SECOND_CHILD, attributes: { color: 'White', size: 'Medium' } },
            ],
        });
        expect(result?.fetchedAt).toEqual(expect.any(String));
        expect(searchCatalogItemsByAsins.mock.calls.some(call => call[0].asins.includes(PARENT))).toBe(
            true
        );
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
        const discoveryCalls = searchCatalogItemsByAsins.mock.calls.filter(call =>
            call[0].asins.includes(DEFAULT_CHILD)
        );
        expect(discoveryCalls.length).toBeGreaterThan(0);
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
});

const createCatalogMock = () => {
    const searchCatalogItemsByAsins = mock<VariationDeps['searchCatalogItemsByAsins']>();
    return {
        deps: { searchCatalogItemsByAsins },
        searchCatalogItemsByAsins,
    };
};

const installStoreSpy = () => {
    const rows = new Map<string, StoredVariationRow>();
    spyOn(eventLogs, 'createEventLogSafe').mockResolvedValue(undefined);
    spyOn(variationStore, 'lookupVariationsByMember').mockImplementation(
        async (_marketplaceId, asin) =>
            [...rows.values()].filter(row => row.memberAsins.includes(asin.toUpperCase()))
    );
    spyOn(variationStore, 'claimVariationFetch').mockImplementation(async input => {
        const parentAsin = input.parentAsin.toUpperCase();
        const key = storeKey(input.marketplaceId, parentAsin);
        const existing = rows.get(key);
        if (existing?.state === 'pending') {
            return false;
        }
        rows.set(key, pendingRow(input.marketplaceId, parentAsin, input.claimId));
        return true;
    });
    spyOn(variationStore, 'refreshVariationLease').mockImplementation(async input => {
        const row = rows.get(storeKey(input.marketplaceId, input.parentAsin.toUpperCase()));
        return row?.claimId === input.claimId && row.state === 'pending';
    });
    spyOn(variationStore, 'finishVariationFetch').mockImplementation(async input => {
        const parentAsin = input.parentAsin.toUpperCase();
        const key = storeKey(input.marketplaceId, parentAsin);
        const row = rows.get(key);
        if (!row || row.claimId !== input.claimId || row.state !== 'pending') {
            return false;
        }
        if (input.resolution.kind === 'none') {
            rows.set(key, {
                ...row,
                state: 'ready',
                kind: 'none',
                theme: [],
                children: null,
                memberAsins: [parentAsin],
                fetchedAt: new Date(),
            });
            return true;
        }
        const children = input.resolution.children.map(child => ({
            asin: child.asin.toUpperCase(),
            attributes: { ...child.attributes },
        }));
        rows.set(key, {
            ...row,
            state: 'ready',
            kind: 'family',
            theme: [...input.resolution.theme],
            children,
            memberAsins: [parentAsin, ...children.map(child => child.asin)],
            fetchedAt: new Date(),
        });
        return true;
    });
    spyOn(variationStore, 'failVariationFetch').mockImplementation(async input => {
        const key = storeKey(input.marketplaceId, input.parentAsin.toUpperCase());
        const row = rows.get(key);
        if (row) {
            rows.set(key, { ...row, state: 'error', fetchedAt: new Date() });
        }
    });
};

const storeKey = (marketplaceId: string, parentAsin: string) => `${marketplaceId}:${parentAsin}`;

const pendingRow = (
    marketplaceId: string,
    parentAsin: string,
    claimId: string
): StoredVariationRow => ({
    marketplaceId,
    parentAsin,
    generatorVersion: VARIATIONS_GENERATOR_VERSION,
    state: 'pending',
    kind: null,
    theme: null,
    children: null,
    memberAsins: [parentAsin],
    claimId,
    attemptedAt: new Date(),
    fetchedAt: null,
});

const catalogItemFor = (asin: string) => {
    if (asin === PARENT) {
        return {
            asin: PARENT,
            relationships: [
                {
                    marketplaceId: MARKETPLACE,
                    relationships: [
                        {
                            type: 'VARIATION',
                            childAsins: [DEFAULT_CHILD, SECOND_CHILD],
                            variationTheme: { attributes: ['color_name', 'size_name'] },
                        },
                    ],
                },
            ],
        };
    }
    if (asin === DEFAULT_CHILD) {
        return {
            asin: DEFAULT_CHILD,
            relationships: [
                {
                    marketplaceId: MARKETPLACE,
                    relationships: [{ type: 'VARIATION', parentAsins: [PARENT] }],
                },
            ],
            attributes: {
                color_name: [{ value: 'Black', marketplace_id: MARKETPLACE }],
                size_name: [{ value: 'Large', marketplace_id: MARKETPLACE }],
            },
        };
    }
    if (asin === SECOND_CHILD) {
        return {
            asin: SECOND_CHILD,
            relationships: [
                {
                    marketplaceId: MARKETPLACE,
                    relationships: [{ type: 'VARIATION', parentAsins: [PARENT] }],
                },
            ],
            attributes: {
                color_name: [{ value: 'White', marketplace_id: MARKETPLACE }],
                size_name: [{ value: 'Medium', marketplace_id: MARKETPLACE }],
            },
        };
    }
    return { asin, relationships: [] };
};
