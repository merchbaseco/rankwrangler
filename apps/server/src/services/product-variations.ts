import { randomUUID } from 'node:crypto';
import {
    claimVariationFetch,
    failVariationFetch,
    finishVariationFetch,
    lookupVariationsByMember,
    refreshVariationLease,
} from '@/db/product/product-variation-store';
import { createSpApiProvider } from '@/services/providers/sp-api/sp-api-provider';
import { createConcurrencyLimit } from './concurrency-limit';
import { createEventLogSafe } from './event-logs';
import { waitForProductEnrichment } from './product-enrichment-wait';
import {
    assembleFamily,
    chunkAsins,
    parseCatalogItems,
    readVariationRole,
    type VariationRole,
} from './product-variations-parse';
import {
    classifyStoredVariations,
    type ProductVariations,
    type VariationRequest,
    toProductVariations,
    variationsRetrievalKey,
} from './product-variations-request';

export type { ProductVariations, VariationRequest } from './product-variations-request';

const POLL_MS = 250;
export const VARIATIONS_FETCH_CONCURRENCY = 2;
const fetchSlots = createConcurrencyLimit(VARIATIONS_FETCH_CONCURRENCY);

export interface VariationDeps {
    searchCatalogItemsByAsins: ReturnType<
        typeof createSpApiProvider
    >['searchCatalogItemsByAsins'];
}

const defaultDeps: VariationDeps = {
    searchCatalogItemsByAsins: (...args) =>
        createSpApiProvider().searchCatalogItemsByAsins(...args),
};

export const getProductVariations = async (
    request: VariationRequest,
    deps: VariationDeps = defaultDeps
): Promise<ProductVariations | null> =>
    await waitForProductEnrichment({
        key: variationsRetrievalKey(request),
        signal: request.signal,
        timeoutMs: request.timeoutMs,
        label: 'Product Variations',
        work: () => resolveVariations(request, deps),
    });

const resolveVariations = async (
    request: VariationRequest,
    deps: VariationDeps
): Promise<ProductVariations | null> => {
    const marketplaceId = request.marketplaceId;
    const requestedAsin = request.asin.toUpperCase();
    let knownParent: string | null = null;
    let discovered: VariationRole | null = null;

    while (true) {
        const classified = classifyStoredVariations(
            await lookupVariationsByMember(marketplaceId, requestedAsin),
            requestedAsin
        );
        if (classified.state === 'ready') {
            return classified.value;
        }
        if (classified.state === 'failed') {
            return null;
        }
        knownParent ??= classified.parentAsin;

        if (knownParent === null) {
            discovered = await discoverRole(marketplaceId, requestedAsin, deps);
            if (discovered.kind === 'none') {
                const claimId = randomUUID();
                const claimed = await claimVariationFetch({
                    marketplaceId,
                    parentAsin: requestedAsin,
                    claimId,
                });
                if (claimed) {
                    await finishVariationFetch({
                        marketplaceId,
                        parentAsin: requestedAsin,
                        claimId,
                        resolution: { kind: 'none' },
                    });
                    return null;
                }
                await new Promise(resolve => setTimeout(resolve, POLL_MS));
                continue;
            }
            knownParent = discovered.parentAsin;
        }

        const parentAsin = knownParent;
        const result = await fetchSlots.run(async () => {
            const claimId = randomUUID();
            if (!(await claimVariationFetch({ marketplaceId, parentAsin, claimId }))) {
                return { kind: 'claimed-elsewhere' } as const;
            }
            return await fetchClaimed({
                marketplaceId,
                parentAsin,
                claimId,
                seed: discovered?.kind === 'parent' ? discovered : null,
                deps,
            });
        });

        if (result.kind === 'ready') {
            return result.value;
        }
        if (result.kind === 'none') {
            return null;
        }
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
    }
};

const fetchClaimed = async ({
    marketplaceId,
    parentAsin,
    claimId,
    seed,
    deps,
}: {
    marketplaceId: string;
    parentAsin: string;
    claimId: string;
    seed: Extract<VariationRole, { kind: 'parent' }> | null;
    deps: VariationDeps;
}): Promise<
    { kind: 'ready'; value: ProductVariations } | { kind: 'none' } | { kind: 'superseded' }
> => {
    try {
        let parentRole = seed;
        if (!parentRole || parentRole.parentAsin !== parentAsin) {
            const role = await discoverRole(marketplaceId, parentAsin, deps);
            if (role.kind === 'none') {
                const saved = await finishVariationFetch({
                    marketplaceId,
                    parentAsin,
                    claimId,
                    resolution: { kind: 'none' },
                });
                return saved ? { kind: 'none' } : { kind: 'superseded' };
            }
            if (role.kind === 'child') {
                throw new Error(
                    `Expected variation parent ${parentAsin} but catalog named parent ${role.parentAsin}.`
                );
            }
            parentRole = role;
        }

        const itemsByAsin = new Map<string, unknown>();
        for (const batch of chunkAsins(parentRole.childAsins)) {
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

        const family = assembleFamily(parentRole, itemsByAsin, marketplaceId);
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
            },
        });
        return { kind: 'ready', value: toProductVariations(family, new Date()) };
    } catch (error) {
        await failVariationFetch({ marketplaceId, parentAsin, claimId });
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

const discoverRole = async (
    marketplaceId: string,
    asin: string,
    deps: VariationDeps
): Promise<VariationRole> => {
    const items = parseCatalogItems(
        await deps.searchCatalogItemsByAsins({
            asins: [asin],
            marketplaceId,
            priority: 'foreground',
        })
    );
    const match = items.find(item => catalogAsin(item) === asin.toUpperCase());
    return match ? readVariationRole(match, marketplaceId) : { kind: 'none' };
};

const catalogAsin = (item: unknown): string | null => {
    if (typeof item !== 'object' || item === null || !('asin' in item)) {
        return null;
    }
    const asin = (item as { asin: unknown }).asin;
    return typeof asin === 'string' ? asin.toUpperCase() : null;
};
