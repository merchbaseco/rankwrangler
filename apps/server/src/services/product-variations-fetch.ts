import {
    failVariationFetch,
    finishVariationFetch,
    refreshVariationLease,
} from '@/db/product/product-variation-store';
import { createEventLogSafe } from './event-logs';
import { discoverVariationRole } from './product-variations-discovery';
import {
    assembleFamily,
    chunkAsins,
    parseCatalogItems,
    truncateChildAsins,
    type VariationRole,
} from './product-variations-parse';
import type { VariationDeps } from './product-variations-discovery';
import { toProductVariations, type ProductVariations } from './product-variations-request';

export const fetchClaimedVariationFamily = async ({
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
            const discovery = await discoverVariationRole(marketplaceId, parentAsin, deps);
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

        const { childAsins, truncated } = truncateChildAsins(parentRole.childAsins);
        if (truncated > 0) {
            console.warn(
                `[Product Variations] Truncated ${truncated} children for ${parentAsin} at cap ${childAsins.length}.`
            );
            await createEventLogSafe({
                level: 'warn',
                status: 'partial',
                category: 'product',
                action: 'product.variations.fetch',
                primitiveType: 'product',
                message: `Truncated variation family for ${parentAsin}.`,
                marketplaceId,
                asin: parentAsin,
                detailsJson: { truncated, kept: childAsins.length },
            });
        }
        parentRole = { ...parentRole, childAsins };

        const itemsByAsin = new Map<string, unknown>();
        for (const [index, batch] of chunkAsins(parentRole.childAsins).entries()) {
            const items = parseCatalogItems(
                await deps.searchCatalogItemsByAsins({
                    asins: [...batch],
                    marketplaceId,
                    priority: index === 0 ? 'foreground' : 'background',
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
                truncated,
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

const catalogAsin = (item: unknown): string | null => {
    if (typeof item !== 'object' || item === null || !('asin' in item)) {
        return null;
    }
    const asin = (item as { asin: unknown }).asin;
    return typeof asin === 'string' ? asin.toUpperCase() : null;
};
