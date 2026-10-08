import { afterEach, describe, expect, it, mock } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { getStoredCutouts } from '@/db/product/product-cutout-thumbnail-store';
import { getStoredShortNames } from '@/db/product/product-short-name-store';
import { productCutoutThumbnails } from '@/db/product-cutout-thumbnail-schema';
import { products } from '@/db/product-schema';
import { productShortNames } from '@/db/product-short-name-schema';
import {
    getCutoutInputFingerprint,
    getProductCutoutThumbnail,
} from '@/services/product-cutout-thumbnail';
import { getProductListingEnrichments } from '@/services/product-listing-enrichment';
import { toPublicCutoutThumbnail } from '@/services/product-read-model';
import { getProductShortName } from '@/services/product-short-name';
import { getShortNameInputFingerprint } from '@/services/product-short-name-request';

const marketplaceId = 'ATVPDKIKX0DER';
const readyAsin = 'B0ENRICH01';
const coldAsin = 'B0ENRICH02';
const title = 'Zombiecorn Unicorn Halloween Shirt';
const imageUrl = (asin: string) => `https://m.media-amazon.com/images/I/${asin}.jpg`;
const isDedicatedCatalogTestDatabase =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test';
const describeCatalogDb = isDedicatedCatalogTestDatabase ? describe : describe.skip;

describeCatalogDb('Product getMany listing enrichment', () => {
    afterEach(async () => {
        await db
            .delete(products)
            .where(
                and(
                    eq(products.marketplaceId, marketplaceId),
                    inArray(products.asin, [readyAsin, coldAsin])
                )
            );
    });

    it('reads ready rows in bulk with the same values get resolves', async () => {
        await db.insert(products).values(
            [readyAsin, coldAsin].map(asin => ({
                marketplaceId,
                asin,
                title,
                thumbnailUrl: imageUrl(asin),
                isMerchListing: true,
                amazonListingStatus: 'active' as const,
            }))
        );
        const ready = { marketplaceId, asin: readyAsin };
        await db.insert(productShortNames).values({
            ...ready,
            inputFingerprint: getShortNameInputFingerprint(title, imageUrl(readyAsin)),
            state: 'ready',
            shortName: 'Zombiecorn',
            claimId: randomUUID(),
            attemptedAt: new Date(),
            completedAt: new Date(),
        });
        await db.insert(productCutoutThumbnails).values({
            ...ready,
            inputFingerprint: getCutoutInputFingerprint(imageUrl(readyAsin)),
            state: 'ready',
            objectKey: 'cutouts/enrich-ready.webp',
            claimId: randomUUID(),
            attemptedAt: new Date(),
            completedAt: new Date(),
        });
        const startProductShortNameGeneration = mock(() => true);
        const startProductCutoutGeneration = mock(() => true);
        const sources = [readyAsin, coldAsin].map(asin => ({
            identity: { marketplaceId, asin },
            product: {
                title,
                thumbnail: { status: 'available' as const, url: imageUrl(asin) },
                isMerchListing: true,
            },
            listingActive: true,
        }));

        const [readyResult, coldResult] = await getProductListingEnrichments(
            { sources, include: ['shortName', 'cutoutThumbnail'] },
            {
                getStoredShortNames,
                getStoredCutouts,
                startProductShortNameGeneration,
                startProductCutoutGeneration,
            }
        );
        const thumbnail = sources[0]?.product.thumbnail ?? { status: 'unavailable' as const };

        expect(readyResult).toEqual({
            shortName: await getProductShortName({ ...ready, title, thumbnail }),
            cutoutThumbnail: toPublicCutoutThumbnail(
                await getProductCutoutThumbnail({ ...ready, thumbnail })
            ),
            pending: [],
        });
        expect(readyResult?.shortName).toBe('Zombiecorn');
        expect(coldResult).toEqual({
            shortName: null,
            cutoutThumbnail: { status: 'pending' },
            pending: ['shortName', 'cutoutThumbnail'],
        });
        expect(startProductShortNameGeneration).toHaveBeenCalledTimes(1);
        expect(startProductCutoutGeneration).toHaveBeenCalledTimes(1);
    });
});
