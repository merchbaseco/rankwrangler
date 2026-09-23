import { afterEach, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    claimShortNameGeneration,
    finishShortNameGeneration,
    getStoredShortName,
    isCurrentShortNameInput,
} from '@/db/product/product-short-name-store';
import { products } from '@/db/product-schema';
import { getShortNameInputFingerprint } from '@/services/product-short-name';
import { getProductShortNameMetrics } from '@/services/product-short-name-metrics';

const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B0SHORTD01' };
const imageUrl = 'https://m.media-amazon.com/test.jpg';
const isDedicatedCatalogTestDatabase =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test';
const describeCatalogDb = isDedicatedCatalogTestDatabase ? describe : describe.skip;

describeCatalogDb('Product short-name persistence', () => {
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

    it('rejects an old worker result after the Product title changes', async () => {
        await db.insert(products).values({
            ...identity,
            title: 'Old Design Shirt',
            thumbnailUrl: imageUrl,
            isMerchListing: true,
            amazonListingStatus: 'active',
        });
        const oldClaimId = randomUUID();
        expect(
            await claimShortNameGeneration({
                ...identity,
                inputFingerprint: 'old',
                claimId: oldClaimId,
            })
        ).toBe(true);

        await db
            .update(products)
            .set({ title: 'New Design Shirt' })
            .where(
                and(
                    eq(products.marketplaceId, identity.marketplaceId),
                    eq(products.asin, identity.asin)
                )
            );

        expect(
            await finishShortNameGeneration({
                ...identity,
                claimId: oldClaimId,
                title: 'Old Design Shirt',
                imageUrl,
                shortName: 'Old Design',
            })
        ).toBe(false);
        expect(
            await isCurrentShortNameInput({ ...identity, title: 'Old Design Shirt', imageUrl })
        ).toBe(false);

        const newClaimId = randomUUID();
        const newFingerprint = getShortNameInputFingerprint('New Design Shirt', imageUrl);
        expect(
            await claimShortNameGeneration({
                ...identity,
                inputFingerprint: newFingerprint,
                claimId: newClaimId,
            })
        ).toBe(true);
        expect(
            await finishShortNameGeneration({
                ...identity,
                claimId: newClaimId,
                title: 'New Design Shirt',
                imageUrl,
                shortName: 'New Design',
            })
        ).toBe(true);
        expect(await getStoredShortName(identity)).toMatchObject({
            state: 'ready',
            inputFingerprint: newFingerprint,
            shortName: 'New Design',
        });
        expect((await getProductShortNameMetrics()).coverage.ready).toBeGreaterThanOrEqual(1);
    });
});
