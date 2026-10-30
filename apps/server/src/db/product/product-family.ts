import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { db } from '@/db/index';
import { productAsinAliases } from '@/db/product-asin-alias-schema';
import { products } from '@/db/product-schema';
import { spApiSyncQueue } from '@/db/schema';
import { mergeProducts } from './merge-products';

type Database = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Identity = { marketplaceId: string; asin: string };

/**
 * Maps each identity to its stored family: a variant ASIN with an alias resolves to the family's
 * ASIN; anything else stays as asked (it is a family ASIN or not stored yet).
 */
export const resolveFamilyIdentities = async <T extends Identity>(
    database: Database,
    identities: readonly T[]
): Promise<Map<string, Identity>> => {
    const resolved = new Map<string, Identity>(
        identities.map(identity => [identityKey(identity), identity])
    );
    const condition = or(
        ...identities.map(identity =>
            and(
                eq(productAsinAliases.marketplaceId, identity.marketplaceId),
                eq(productAsinAliases.asin, identity.asin)
            )
        )
    );
    if (!condition) return resolved;
    const rows = await database
        .select({
            marketplaceId: productAsinAliases.marketplaceId,
            alias: productAsinAliases.asin,
            asin: products.asin,
        })
        .from(productAsinAliases)
        .innerJoin(products, eq(products.id, productAsinAliases.productId))
        .where(condition);
    for (const row of rows) {
        resolved.set(identityKey({ marketplaceId: row.marketplaceId, asin: row.alias }), {
            marketplaceId: row.marketplaceId,
            asin: row.asin,
        });
    }
    return resolved;
};

/**
 * Folds a variant observation into its family before the family row is written. A stored row for
 * the variant (from before variations were known) becomes the family row, or merges into it when
 * both exist; the variant is recorded as an alias. Returns the family ASIN to write under.
 */
export const claimProductFamily = async (
    transaction: Transaction,
    input: { marketplaceId: string; asin: string; parentAsin: string | null }
) => {
    const variantAsin = input.asin;
    const familyAsin = input.parentAsin ?? variantAsin;
    if (familyAsin === variantAsin) return familyAsin;
    await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`product-family:${input.marketplaceId}:${familyAsin}`}))`
    );
    const rows = await transaction
        .select({
            id: products.id,
            asin: products.asin,
            keepaFetchedAt: products.keepaFetchedAt,
            keepaFirstTrackedAt: products.keepaFirstTrackedAt,
        })
        .from(products)
        .where(
            and(
                eq(products.marketplaceId, input.marketplaceId),
                inArray(products.asin, [familyAsin, variantAsin])
            )
        )
        .for('update');
    const family = rows.find(row => row.asin === familyAsin);
    const variant = rows.find(row => row.asin === variantAsin);
    if (variant) {
        const survivor = family ? richerHistory(family, variant) : variant;
        if (family) {
            await mergeProducts(transaction, {
                survivorId: survivor.id,
                otherId: survivor === family ? variant.id : family.id,
            });
        }
        await transaction
            .update(products)
            .set({ asin: familyAsin })
            .where(eq(products.id, survivor.id));
        // The renamed row still carries a variant's title; fetch the parent listing itself.
        await transaction
            .insert(spApiSyncQueue)
            .values({ marketplaceId: input.marketplaceId, asin: familyAsin })
            .onConflictDoNothing();
    }
    if (family || variant) {
        await transaction
            .update(products)
            .set({ representativeAsin: sql`coalesce(${products.representativeAsin}, ${variantAsin})` })
            .where(
                and(eq(products.marketplaceId, input.marketplaceId), eq(products.asin, familyAsin))
            );
    }
    return familyAsin;
};

/** Records variant ASINs against the family rows already written under their family ASINs. */
export const recordVariantAliases = async (
    transaction: Database,
    marketplaceId: string,
    variants: readonly { asin: string; familyAsin: string }[]
) => {
    const pairs = variants.filter(variant => variant.asin !== variant.familyAsin);
    if (!pairs.length) return;
    const families = await transaction
        .select({ id: products.id, asin: products.asin })
        .from(products)
        .where(
            and(
                eq(products.marketplaceId, marketplaceId),
                inArray(
                    products.asin,
                    pairs.map(pair => pair.familyAsin)
                )
            )
        );
    const familyIds = new Map(families.map(row => [row.asin, row.id]));
    const values = pairs.flatMap(pair => {
        const productId = familyIds.get(pair.familyAsin);
        return productId ? [{ marketplaceId, asin: pair.asin, productId }] : [];
    });
    if (!values.length) return;
    await transaction
        .insert(productAsinAliases)
        .values(values)
        .onConflictDoUpdate({
            target: [productAsinAliases.marketplaceId, productAsinAliases.asin],
            set: { productId: sql`excluded.product_id` },
        });
};

// The row that keeps the family's history: the one Keepa has tracked longest.
const richerHistory = <T extends { keepaFetchedAt: Date | null; keepaFirstTrackedAt: Date | null }>(
    family: T,
    variant: T
) => {
    if (!variant.keepaFetchedAt) return family;
    if (!family.keepaFetchedAt) return variant;
    const familyFirst = family.keepaFirstTrackedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const variantFirst = variant.keepaFirstTrackedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return variantFirst < familyFirst ? variant : family;
};

const identityKey = (identity: Identity) => `${identity.marketplaceId}:${identity.asin}`;
export const familyIdentityKey = identityKey;
