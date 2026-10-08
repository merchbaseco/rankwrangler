import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { productCutoutThumbnails } from '@/db/product-cutout-thumbnail-schema';
import { products } from '@/db/product-schema';

export interface CutoutIdentity {
    marketplaceId: string;
    asin: string;
}
const CLAIM_LEASE_SECONDS = 45;
export const CUTOUT_ERROR_RETRY_MS = 5 * 60 * 1000;

export const getStoredCutout = async ({ marketplaceId, asin }: CutoutIdentity) => {
    const [row] = await db
        .select()
        .from(productCutoutThumbnails)
        .where(
            and(
                eq(productCutoutThumbnails.marketplaceId, marketplaceId),
                eq(productCutoutThumbnails.asin, asin)
            )
        );
    return row ?? null;
};

export const isCurrentCutoutSource = async ({
    marketplaceId,
    asin,
    sourceUrl,
}: CutoutIdentity & { sourceUrl: string }) => {
    const [row] = await db
        .select({ thumbnailUrl: products.thumbnailUrl, status: products.amazonListingStatus })
        .from(products)
        .where(and(eq(products.marketplaceId, marketplaceId), eq(products.asin, asin)));
    return row?.thumbnailUrl === sourceUrl && row.status === 'active';
};

export const claimCutoutGeneration = async ({
    marketplaceId,
    asin,
    inputFingerprint,
    claimId,
}: CutoutIdentity & { inputFingerprint: string; claimId: string }) => {
    const rows = await db.execute<{ claim_id: string }>(sql`
        INSERT INTO product_cutout_thumbnails (
            marketplace_id, asin, input_fingerprint, state, object_key,
            claim_id, attempted_at, completed_at
        ) VALUES (
            ${marketplaceId}, ${asin}, ${inputFingerprint}, 'pending', NULL,
            ${claimId}::uuid, now(), NULL
        )
        ON CONFLICT (marketplace_id, asin) DO UPDATE SET
            input_fingerprint = excluded.input_fingerprint,
            state = 'pending',
            object_key = NULL,
            claim_id = excluded.claim_id,
            attempted_at = excluded.attempted_at,
            completed_at = NULL
        WHERE product_cutout_thumbnails.input_fingerprint <> excluded.input_fingerprint
            OR (product_cutout_thumbnails.state = 'pending'
                AND product_cutout_thumbnails.attempted_at < now() - ${CLAIM_LEASE_SECONDS} * interval '1 second')
            OR (product_cutout_thumbnails.state = 'error'
                AND product_cutout_thumbnails.attempted_at < now() - ${CUTOUT_ERROR_RETRY_MS} * interval '1 millisecond')
        RETURNING claim_id
    `);
    return rows.length > 0;
};

export const finishCutoutGeneration = async ({
    marketplaceId,
    asin,
    claimId,
    sourceUrl,
    objectKey,
}: CutoutIdentity & { claimId: string; sourceUrl: string; objectKey: string }) => {
    const rows = await db
        .update(productCutoutThumbnails)
        .set({ state: 'ready', objectKey, completedAt: new Date() })
        .where(
            and(
                eq(productCutoutThumbnails.marketplaceId, marketplaceId),
                eq(productCutoutThumbnails.asin, asin),
                eq(productCutoutThumbnails.claimId, claimId),
                eq(productCutoutThumbnails.state, 'pending'),
                sql`EXISTS (
                    SELECT 1 FROM products p
                    WHERE p.marketplace_id = ${marketplaceId}
                        AND p.asin = ${asin}
                        AND p.thumbnail_url = ${sourceUrl}
                        AND p.amazon_listing_status = 'active'
                )`
            )
        )
        .returning({ claimId: productCutoutThumbnails.claimId });
    return rows.length > 0;
};

export const failCutoutGeneration = async ({
    marketplaceId,
    asin,
    claimId,
}: CutoutIdentity & { claimId: string }) => {
    await db
        .update(productCutoutThumbnails)
        .set({ state: 'error', completedAt: new Date() })
        .where(
            and(
                eq(productCutoutThumbnails.marketplaceId, marketplaceId),
                eq(productCutoutThumbnails.asin, asin),
                eq(productCutoutThumbnails.claimId, claimId),
                eq(productCutoutThumbnails.state, 'pending')
            )
        );
};
