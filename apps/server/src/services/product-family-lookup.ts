import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    familyIdentityKey,
    resolveFamilyIdentities,
} from '@/db/product/product-family';
import { productAsinAliases } from '@/db/product-asin-alias-schema';
import { products } from '@/db/product-schema';
import { enqueueSpApiSyncQueueItems } from '@/services/spapi-sync-queue';

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';

export type ProductFamilyVariantAttributes = {
    size: string | null;
    color: string | null;
    fit: string | null;
    style: string | null;
};

export type ProductFamilyVariant = {
    asin: string;
    attributes: ProductFamilyVariantAttributes;
};

export type KnownProductFamilyLookup = {
    status: 'known';
    marketplaceId: string;
    requestedAsin: string;
    familyAsin: string;
    variationsCheckedAt: string | null;
    variants: ProductFamilyVariant[];
};

export type UnknownProductFamilyLookup = {
    status: 'unknown';
    marketplaceId: string;
    requestedAsin: string;
};

export type ProductFamilyLookupEntry = KnownProductFamilyLookup | UnknownProductFamilyLookup;

export type ProductFamilyLookupInput = {
    marketplaceId?: string;
    asins: readonly string[];
};

export interface ProductFamilyLookupDeps {
    resolveFamilyIdentities: typeof resolveFamilyIdentities;
    loadFamilies: (
        marketplaceId: string,
        familyAsins: readonly string[]
    ) => Promise<readonly FamilyRow[]>;
    loadAliases: (
        productIds: readonly string[]
    ) => Promise<readonly AliasRow[]>;
    enqueueUnknownAsins: typeof enqueueSpApiSyncQueueItems;
}

type FamilyRow = {
    id: string;
    asin: string;
    variationsCheckedAt: Date | null;
};

type AliasRow = {
    productId: string;
    asin: string;
};

const emptyAttributes = (): ProductFamilyVariantAttributes => ({
    size: null,
    color: null,
    fit: null,
    style: null,
});

const defaultDeps: ProductFamilyLookupDeps = {
    resolveFamilyIdentities,
    loadFamilies: async (marketplaceId, familyAsins) => {
        if (familyAsins.length === 0) return [];
        return await db
            .select({
                id: products.id,
                asin: products.asin,
                variationsCheckedAt: products.variationsCheckedAt,
            })
            .from(products)
            .where(
                and(eq(products.marketplaceId, marketplaceId), inArray(products.asin, [...familyAsins]))
            );
    },
    loadAliases: async productIds => {
        if (productIds.length === 0) return [];
        return await db
            .select({
                productId: productAsinAliases.productId,
                asin: productAsinAliases.asin,
            })
            .from(productAsinAliases)
            .where(inArray(productAsinAliases.productId, [...productIds]));
    },
    enqueueUnknownAsins: enqueueSpApiSyncQueueItems,
};

/**
 * Pure catalog read of variation families for requested ASINs. Unknown ASINs stay unknown; they are
 * optionally enqueued for normal background SP-API discovery and never guessed.
 */
export const lookupProductFamilies = async (
    input: ProductFamilyLookupInput,
    deps: ProductFamilyLookupDeps = defaultDeps
): Promise<ProductFamilyLookupEntry[]> => {
    const marketplaceId = input.marketplaceId ?? US_MARKETPLACE_ID;
    const identities = input.asins.map(asin => ({ marketplaceId, asin }));
    const resolved = await deps.resolveFamilyIdentities(db, identities);
    const familyAsins = [
        ...new Set(
            identities.map(
                identity => resolved.get(familyIdentityKey(identity))?.asin ?? identity.asin
            )
        ),
    ];
    const familyRows = await deps.loadFamilies(marketplaceId, familyAsins);
    const familyByAsin = new Map(familyRows.map(row => [row.asin, row]));
    const aliases = await deps.loadAliases(familyRows.map(row => row.id));
    const aliasesByProductId = new Map<string, string[]>();
    for (const alias of aliases) {
        const list = aliasesByProductId.get(alias.productId);
        if (list) list.push(alias.asin);
        else aliasesByProductId.set(alias.productId, [alias.asin]);
    }

    const results: ProductFamilyLookupEntry[] = identities.map(identity => {
        const familyAsin = resolved.get(familyIdentityKey(identity))?.asin ?? identity.asin;
        const family = familyByAsin.get(familyAsin);
        if (!family) {
            return {
                status: 'unknown',
                marketplaceId,
                requestedAsin: identity.asin,
            };
        }
        const variantAsins = [...(aliasesByProductId.get(family.id) ?? [])].sort();
        return {
            status: 'known',
            marketplaceId,
            requestedAsin: identity.asin,
            familyAsin: family.asin,
            variationsCheckedAt: family.variationsCheckedAt?.toISOString() ?? null,
            variants: variantAsins.map(asin => ({
                asin,
                attributes: emptyAttributes(),
            })),
        };
    });

    const unknown = results
        .filter((entry): entry is UnknownProductFamilyLookup => entry.status === 'unknown')
        .map(entry => ({ marketplaceId: entry.marketplaceId, asin: entry.requestedAsin }));
    if (unknown.length > 0) {
        try {
            await deps.enqueueUnknownAsins(unknown);
        } catch {
            // Background discovery must not fail the read.
        }
    }

    return results;
};
