import {
    failVariationFetch,
    finishVariationFetch,
    refreshVariationLease,
} from '@/db/product/product-variation-store';
import { createEventLogSafe } from './event-logs';
import { discoverVariationRole, type VariationDeps } from './product-variations-discovery';
import {
    assembleFamily,
    chunkAsins,
    parseCatalogItems,
    truncateChildAsins,
    type VariationRole,
} from './product-variations-parse';
import { toProductVariations, type ProductVariations } from './product-variations-request';

/** Wall-clock budget for one claimed family Catalog walk (all batches foreground). */
export const VARIATIONS_FAMILY_FETCH_DEADLINE_MS = 60_000;

export class VariationFamilyFetchAbortedError extends Error {
    constructor(parentAsin: string) {
        super(`Product variation fetch aborted for ${parentAsin}.`);
        this.name = 'VariationFamilyFetchAbortedError';
    }
}

export const fetchClaimedVariationFamily = async ({
    marketplaceId,
    parentAsin,
    claimId,
    seed,
    deps,
    signal,
}: {
    marketplaceId: string;
    parentAsin: string;
    claimId: string;
    seed: Extract<VariationRole, { kind: 'parent' }> | null;
    deps: VariationDeps;
    signal?: AbortSignal;
}): Promise<
    | { kind: 'ready'; value: ProductVariations }
    | { kind: 'none' }
    | { kind: 'superseded' }
    | { kind: 'aborted' }
> => {
    const fetchSignal =
        signal ?? AbortSignal.timeout(VARIATIONS_FAMILY_FETCH_DEADLINE_MS);
    try {
        throwIfAborted(fetchSignal, parentAsin);
        let parentRole = seed;
        if (!parentRole || parentRole.parentAsin !== parentAsin) {
            const discovery = await discoverVariationRole(marketplaceId, parentAsin, deps);
            throwIfAborted(fetchSignal, parentAsin);
            if (discovery.kind === 'unavailable') {
                await failVariationFetch({ marketplaceId, parentAsin, claimId });
                return { kind: 'superseded' };
            }
            if (discovery.kind === 'none') {
                const saved = await finishVariationFetch({
                    marketplaceId,
                    parentAsin,
                    claimId,
                    resolution: { kind: 'none' },
                });
                return saved ? { kind: 'none' } : { kind: 'superseded' };
            }
            if (discovery.kind === 'child') {
                throw new Error(
                    `Expected variation parent ${parentAsin} but catalog named parent ${discovery.parentAsin}.`
                );
            }
            parentRole = discovery;
        }

        const allChildAsins = parentRole.childAsins;
        const { childAsins: attributeChildAsins, truncated } = truncateChildAsins(allChildAsins);
        if (truncated > 0) {
            console.warn(
                `[Product Variations] Truncated attribute lookups for ${truncated} children of ${parentAsin}; kept ${attributeChildAsins.length} attribute rows and all member ASINs.`
            );
            await createEventLogSafe({
                level: 'warn',
                status: 'partial',
                category: 'product',
                action: 'product.variations.fetch',
                primitiveType: 'product',
                message: `Truncated variation attribute lookups for ${parentAsin}.`,
                marketplaceId,
                asin: parentAsin,
                detailsJson: {
                    truncated,
                    attributeChildren: attributeChildAsins.length,
                    memberChildren: allChildAsins.length,
                },
            });
        }

        const itemsByAsin = new Map<string, unknown>();
        for (const batch of chunkAsins(attributeChildAsins)) {
            throwIfAborted(fetchSignal, parentAsin);
            const items = parseCatalogItems(
                await deps.searchCatalogItemsByAsins({
                    asins: [...batch],
                    marketplaceId,
                    priority: 'foreground',
                })
            );
            for (const item of items) {
                const asin = catalogAsin(item);
                if (asin) {
                    itemsByAsin.set(asin, item);
                }
            }
            if (!(await refreshVariationLease({ marketplaceId, parentAsin, claimId }))) {
                return { kind: 'superseded' };
            }
        }

        throwIfAborted(fetchSignal, parentAsin);
        // Full Amazon child list: truncated ASINs stay as members with empty attributes.
        const family = assembleFamily(
            { ...parentRole, childAsins: allChildAsins },
            itemsByAsin,
            marketplaceId
        );
        const saved = await finishVariationFetch({
            marketplaceId,
            parentAsin,
            claimId,
            resolution: {
                kind: 'family',
                theme: family.theme,
                children: family.children.map(child => ({
                    asin: child.asin,
                    attributes: { ...child.attributes },
                })),
            },
        });
        if (!saved) {
            return { kind: 'superseded' };
        }
        await createEventLogSafe({
            level: 'info',
            status: 'success',
            category: 'product',
            action: 'product.variations.fetch',
            primitiveType: 'product',
            message: `Fetched variation family for ${parentAsin}.`,
            marketplaceId,
            asin: parentAsin,
            detailsJson: {
                outcome: 'family',
                childCount: family.children.length,
                theme: [...family.theme],
                truncated,
            },
        });
        return { kind: 'ready', value: toProductVariations(family, new Date()) };
    } catch (error) {
        await failVariationFetch({ marketplaceId, parentAsin, claimId });
        if (isAbortError(error)) {
            await createEventLogSafe({
                level: 'warn',
                status: 'failed',
                category: 'product',
                action: 'product.variations.fetch',
                primitiveType: 'product',
                message: `Variation fetch timed out for ${parentAsin}.`,
                marketplaceId,
                asin: parentAsin,
                detailsJson: { outcome: 'aborted', retryable: true },
            });
            return { kind: 'aborted' };
        }
        await createEventLogSafe({
            level: 'error',
            status: 'failed',
            category: 'product',
            action: 'product.variations.fetch',
            primitiveType: 'product',
            message: `Variation fetch failed for ${parentAsin}.`,
            marketplaceId,
            asin: parentAsin,
        });
        throw new Error(`Product variation fetch failed for ${parentAsin}.`, { cause: error });
    }
};

const throwIfAborted = (signal: AbortSignal, parentAsin: string) => {
    if (signal.aborted) {
        throw new VariationFamilyFetchAbortedError(parentAsin);
    }
};

const isAbortError = (error: unknown) =>
    error instanceof VariationFamilyFetchAbortedError ||
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'AbortError');

const catalogAsin = (item: unknown): string | null => {
    if (typeof item !== 'object' || item === null || !('asin' in item)) {
        return null;
    }
    const asin = (item as { asin: unknown }).asin;
    return typeof asin === 'string' ? asin.toUpperCase() : null;
};
