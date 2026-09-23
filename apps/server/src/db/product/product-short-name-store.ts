import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/product-schema';
import { productShortNames } from '@/db/product-short-name-schema';

export interface ShortNameIdentity {
    marketplaceId: string;
    asin: string;
}

const CLAIM_LEASE_SECONDS = 30;
export const SHORT_NAME_ERROR_RETRY_MS = 5 * 60 * 1000;

export const getStoredShortName = async (identity: ShortNameIdentity) => {
    const [row] = await db
        .select()
        .from(productShortNames)
        .where(
            and(
                eq(productShortNames.marketplaceId, identity.marketplaceId),
                eq(productShortNames.asin, identity.asin)
            )
        );
    return row ?? null;
};

export const isCurrentShortNameInput = async ({
    marketplaceId,
    asin,
    title,
    imageUrl,
}: ShortNameIdentity & { title: string; imageUrl: string }) => {
    const [product] = await db
        .select({
            title: products.title,
            thumbnailUrl: products.thumbnailUrl,
            isMerchListing: products.isMerchListing,
            amazonListingStatus: products.amazonListingStatus,
        })
        .from(products)
        .where(and(eq(products.marketplaceId, marketplaceId), eq(products.asin, asin)));
    return (
        product !== undefined &&
        product.title === title &&
        product.thumbnailUrl === imageUrl &&
        product.isMerchListing === true &&
        product.amazonListingStatus === 'active'
    );
};

export const claimShortNameGeneration = async ({
    marketplaceId,
    asin,
    inputFingerprint,
    claimId,
}: ShortNameIdentity & { inputFingerprint: string; claimId: string }) => {
    const rows = await db.execute<{ claim_id: string }>(sql`
        INSERT INTO product_short_names (
            marketplace_id, asin, input_fingerprint, state, short_name,
            claim_id, attempted_at, completed_at
        ) VALUES (
            ${marketplaceId}, ${asin}, ${inputFingerprint}, 'pending', NULL,
            ${claimId}::uuid, now(), NULL
        )
        ON CONFLICT (marketplace_id, asin) DO UPDATE SET
            input_fingerprint = excluded.input_fingerprint,
            state = 'pending',
            short_name = NULL,
            claim_id = excluded.claim_id,
            attempted_at = excluded.attempted_at,
            completed_at = NULL
        WHERE product_short_names.input_fingerprint <> excluded.input_fingerprint
            OR (product_short_names.state = 'pending'
                AND product_short_names.attempted_at < now() - ${CLAIM_LEASE_SECONDS} * interval '1 second')
            OR (product_short_names.state = 'error'
                AND product_short_names.attempted_at < now() - ${SHORT_NAME_ERROR_RETRY_MS} * interval '1 millisecond')
        RETURNING claim_id
    `);
    return rows.length > 0;
};

export const finishShortNameGeneration = async ({
    marketplaceId,
    asin,
    claimId,
    shortName,
    title,
    imageUrl,
}: ShortNameIdentity & {
    claimId: string;
    shortName: string | null;
    title: string;
    imageUrl: string;
}) => {
    const rows = await db
        .update(productShortNames)
        .set({ state: 'ready', shortName, completedAt: new Date() })
        .where(
            and(
                eq(productShortNames.marketplaceId, marketplaceId),
                eq(productShortNames.asin, asin),
                eq(productShortNames.claimId, claimId),
                eq(productShortNames.state, 'pending'),
                sql`EXISTS (
                    SELECT 1 FROM products p
                    WHERE p.marketplace_id = ${marketplaceId}
                        AND p.asin = ${asin}
                        AND p.title = ${title}
                        AND p.thumbnail_url = ${imageUrl}
                        AND p.is_merch_listing = true
                        AND p.amazon_listing_status = 'active'
                )`
            )
        )
        .returning({ claimId: productShortNames.claimId });
    return rows.length > 0;
};

export const failShortNameGeneration = async ({
    marketplaceId,
    asin,
    claimId,
}: ShortNameIdentity & { claimId: string }) => {
    await db
        .update(productShortNames)
        .set({ state: 'error', completedAt: new Date() })
        .where(
            and(
                eq(productShortNames.marketplaceId, marketplaceId),
                eq(productShortNames.asin, asin),
                eq(productShortNames.claimId, claimId),
                eq(productShortNames.state, 'pending')
            )
        );
};
