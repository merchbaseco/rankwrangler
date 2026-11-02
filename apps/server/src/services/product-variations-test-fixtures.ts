import {
    VARIATIONS_GENERATOR_VERSION,
    VARIATIONS_MEMBER_REFRESH_MS,
    type StoredVariationRow,
} from '@/db/product/product-variation-store';
import * as variationStore from '@/db/product/product-variation-store';
import { mock, spyOn } from 'bun:test';
import * as eventLogs from './event-logs';
import type { VariationDeps } from './product-variations';

export const MARKETPLACE = 'ATVPDKIKX0DER';
export const PARENT = 'B0GHTD7TKB';
export const DEFAULT_CHILD = 'B0GHT1WYPY';
export const SECOND_CHILD = 'B0GHT00002';
export const ORPHAN_CHILD = 'B0ORPHAN001';

export const createCatalogMock = () => {
    const searchCatalogItemsByAsins = mock<VariationDeps['searchCatalogItemsByAsins']>();
    return {
        deps: { searchCatalogItemsByAsins },
        searchCatalogItemsByAsins,
    };
};

export const installStoreSpy = () => {
    const rows = new Map<string, StoredVariationRow>();
    spyOn(eventLogs, 'createEventLogSafe').mockResolvedValue(undefined);
    spyOn(variationStore, 'lookupVariationsByMember').mockImplementation(
        async (_marketplaceId, asin) =>
            [...rows.values()].filter(row => row.memberAsins.includes(asin.toUpperCase()))
    );
    spyOn(variationStore, 'getStoredVariation').mockImplementation(async identity => {
        return rows.get(storeKey(identity.marketplaceId, identity.parentAsin.toUpperCase())) ?? null;
    });
    spyOn(variationStore, 'claimVariationFetch').mockImplementation(async input => {
        const parentAsin = input.parentAsin.toUpperCase();
        const key = storeKey(input.marketplaceId, parentAsin);
        const existing = rows.get(key);
        if (existing?.state === 'pending') {
            return false;
        }
        if (existing?.state === 'ready' && existing.fetchedAt) {
            const ageMs = Date.now() - existing.fetchedAt.getTime();
            const threshold = input.allowMemberRefresh
                ? VARIATIONS_MEMBER_REFRESH_MS
                : 24 * 60 * 60 * 1000;
            if (ageMs < threshold) {
                return false;
            }
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
            rows.set(key, { ...row, state: 'error', fetchedAt: null });
        }
    });
    return {
        getRow: (marketplaceId: string, parentAsin: string) =>
            rows.get(storeKey(marketplaceId, parentAsin.toUpperCase())) ?? null,
        seedPending: ({
            marketplaceId,
            parentAsin,
            claimId,
        }: {
            marketplaceId: string;
            parentAsin: string;
            claimId: string;
        }) => {
            rows.set(
                storeKey(marketplaceId, parentAsin.toUpperCase()),
                pendingRow(marketplaceId, parentAsin.toUpperCase(), claimId)
            );
        },
        seedReadyFamily: ({
            marketplaceId,
            parentAsin,
            children,
            fetchedAt,
        }: {
            marketplaceId: string;
            parentAsin: string;
            children: Array<{ asin: string; attributes: Record<string, string> }>;
            fetchedAt: Date;
        }) => {
            const upperParent = parentAsin.toUpperCase();
            rows.set(storeKey(marketplaceId, upperParent), {
                marketplaceId,
                parentAsin: upperParent,
                generatorVersion: VARIATIONS_GENERATOR_VERSION,
                state: 'ready',
                kind: 'family',
                theme: ['color', 'size'],
                children: children.map(child => ({
                    asin: child.asin.toUpperCase(),
                    attributes: { ...child.attributes },
                })),
                memberAsins: [upperParent, ...children.map(child => child.asin.toUpperCase())],
                claimId: '00000000-0000-0000-0000-000000000001',
                attemptedAt: fetchedAt,
                fetchedAt,
            });
        },
    };
};

export const catalogItemFor = (asin: string) => {
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
                            variationTheme: { attributes: ['COLOR_NAME', 'SIZE_NAME'] },
                        },
                    ],
                },
            ],
        };
    }
    if (asin === DEFAULT_CHILD) {
        return merchChild(DEFAULT_CHILD, 'Black', 'Large');
    }
    if (asin === SECOND_CHILD) {
        return merchChild(SECOND_CHILD, 'White', 'Medium');
    }
    return { asin, relationships: [] };
};

const merchChild = (asin: string, color: string, size: string) => ({
    asin,
    relationships: [
        {
            marketplaceId: MARKETPLACE,
            relationships: [{ type: 'VARIATION', parentAsins: [PARENT] }],
        },
    ],
    attributes: {
        color: [{ value: color, marketplace_id: MARKETPLACE }],
        size: [{ value: size, marketplace_id: MARKETPLACE }],
        fit_type: [{ value: 'Mens', marketplace_id: MARKETPLACE }],
    },
});

export const waitUntil = async (predicate: () => boolean, timeoutMs = 2_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for condition.');
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
