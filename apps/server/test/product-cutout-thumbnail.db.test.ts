import { afterEach, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    claimCutoutGeneration,
    finishCutoutGeneration,
    getStoredCutout,
} from '@/db/product/product-cutout-thumbnail-store';
import { products } from '@/db/product-schema';
import { getCutoutInputFingerprint } from '@/services/product-cutout-thumbnail';
import { getProductCutoutThumbnailMetrics } from '@/services/product-cutout-thumbnail-metrics';

const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B0CUTOUT01' };
const firstSource = 'https://m.media-amazon.com/images/I/first.jpg';
const secondSource = 'https://m.media-amazon.com/images/I/second.jpg';
const isDedicatedCatalogTestDatabase =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test';
const describeCatalogDb = isDedicatedCatalogTestDatabase ? describe : describe.skip;

describeCatalogDb('Product cutout thumbnail persistence', () => {
    afterEach(async () => {
        await db
            .delete(products)
            .where(
                and(
                    eq(products.marketplaceId, identity.marketplaceId),
                    eq(products.asin, identity.asin)
                )
            );
    });

    it('rejects a stale worker and keeps only the current cutout', async () => {
        await db.insert(products).values({
            ...identity,
            thumbnailUrl: firstSource,
            amazonListingStatus: 'active',
        });
        const firstClaimId = randomUUID();
        expect(
            await claimCutoutGeneration({
                ...identity,
                inputFingerprint: getCutoutInputFingerprint(firstSource),
                claimId: firstClaimId,
            })
        ).toBe(true);

        await db
            .update(products)
            .set({ thumbnailUrl: secondSource })
            .where(
                and(
                    eq(products.marketplaceId, identity.marketplaceId),
                    eq(products.asin, identity.asin)
                )
            );
        expect(
            await finishCutoutGeneration({
                ...identity,
                claimId: firstClaimId,
                sourceUrl: firstSource,
                objectKey: 'cutouts/stale.webp',
            })
        ).toBe(false);

        const secondClaimId = randomUUID();
        expect(
            await claimCutoutGeneration({
                ...identity,
                inputFingerprint: getCutoutInputFingerprint(secondSource),
                claimId: secondClaimId,
            })
        ).toBe(true);
        expect(
            await finishCutoutGeneration({
                ...identity,
                claimId: secondClaimId,
                sourceUrl: secondSource,
                objectKey: 'cutouts/current.webp',
            })
        ).toBe(true);
        expect(await getStoredCutout(identity)).toMatchObject({
            state: 'ready',
            inputFingerprint: getCutoutInputFingerprint(secondSource),
            objectKey: 'cutouts/current.webp',
        });
        expect((await getProductCutoutThumbnailMetrics()).coverage.ready).toBeGreaterThanOrEqual(1);
    });
});
