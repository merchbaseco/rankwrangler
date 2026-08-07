import { afterEach, describe, expect, it } from 'bun:test';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { ensureProductIdentities } from '@/db/product/get-products';
import { persistNormalizedKeepaProduct } from '@/db/product/persist-normalized-keepa-product';
import { upsertProductInfo } from '@/db/product/upsert-product';
import { products } from '@/db/schema';
import { normalizeKeepaProduct } from '@/services/keepa-product-normalizer';
import type { SpApiProduct } from '@/types';

const MARKETPLACE_ID = 'ATVPDKIKX0DER';
const TEST_ASINS = [
    'B0MERCHDB001',
    'B0MERCHDB002',
    'B0MERCHDB003',
    'B0MERCHDB004',
    'B0MERCHDB005',
] as const;
const isDedicatedCatalogTestDatabase =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.DATABASE_NAME === 'rankwrangler_catalog_test';
const describeCatalogDb = isDedicatedCatalogTestDatabase ? describe : describe.skip;

describeCatalogDb('Merch-listing classification persistence', () => {
    afterEach(async () => {
        await db.delete(products).where(inArray(products.asin, TEST_ASINS));
    });

    it('defaults newly ensured Products to unknown', async () => {
        await ensureProductIdentities([{ marketplaceId: MARKETPLACE_ID, asin: TEST_ASINS[0] }]);

        expect(await readClassification(TEST_ASINS[0])).toEqual({
            isMerchListing: null,
            bullet1: null,
            bullet2: null,
        });
    });

    it('reconciles a false SP-API result to true Keepa evidence', async () => {
        await upsertProductInfo(
            createSpApiProduct(
                TEST_ASINS[1],
                false,
                'Lightweight, Classic fit, Double-needle sleeve and bottom hem'
            )
        );
        await persistKeepaProduct(TEST_ASINS[1], [
            'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
            'Keepa seller detail one',
            'Keepa seller detail two',
        ]);

        expect(await readClassification(TEST_ASINS[1])).toEqual({
            isMerchListing: true,
            bullet1: 'Keepa seller detail one',
            bullet2: 'Keepa seller detail two',
        });
    });

    it('preserves classification and seller bullets when Keepa evidence is unavailable', async () => {
        await upsertProductInfo(createSpApiProduct(TEST_ASINS[2], true, 'Existing seller detail'));
        await persistKeepaProduct(TEST_ASINS[2], null);

        expect(await readClassification(TEST_ASINS[2])).toEqual({
            isMerchListing: true,
            bullet1: 'Existing seller detail',
            bullet2: null,
        });
    });

    it('keeps true monotonic across concurrent false and unavailable writes', async () => {
        await upsertProductInfo(createSpApiProduct(TEST_ASINS[3], true, 'Seller detail'));

        await Promise.all([
            upsertProductInfo(createSpApiProduct(TEST_ASINS[3], false)),
            upsertProductInfo(createSpApiProduct(TEST_ASINS[3], null)),
        ]);

        expect(await readClassification(TEST_ASINS[3])).toEqual({
            isMerchListing: true,
            bullet1: 'Seller detail',
            bullet2: null,
        });
    });

    it('keeps Keepa seller bullets when true evidence races a false raw-bullet insert', async () => {
        await Promise.all([
            upsertProductInfo(
                createSpApiProduct(
                    TEST_ASINS[4],
                    false,
                    'Lightweight, Classic fit, Double-needle sleeve and bottom hem'
                )
            ),
            persistKeepaProduct(TEST_ASINS[4], [
                'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
                'Concurrent Keepa seller detail',
            ]),
        ]);

        expect(await readClassification(TEST_ASINS[4])).toEqual({
            isMerchListing: true,
            bullet1: 'Concurrent Keepa seller detail',
            bullet2: null,
        });
    });
});

const readClassification = async (asin: string) => {
    const [product] = await db
        .select({
            isMerchListing: products.isMerchListing,
            bullet1: products.bullet1,
            bullet2: products.bullet2,
        })
        .from(products)
        .where(and(eq(products.marketplaceId, MARKETPLACE_ID), eq(products.asin, asin)));
    return product ?? null;
};

const createSpApiProduct = (
    asin: string,
    isMerchListing: boolean | null,
    bullet1: string | null = null,
    bullet2: string | null = null
): SpApiProduct => ({
    asin,
    marketplaceId: MARKETPLACE_ID,
    dateFirstAvailable: null,
    title: null,
    brand: null,
    isMerchListing,
    bullet1,
    bullet2,
    rootCategoryId: null,
    rootCategoryBsr: null,
    thumbnailUrl: null,
    keepa: null,
    fetchedAt: '2026-08-07T12:00:00.000Z',
});

const persistKeepaProduct = async (asin: string, features: string[] | null) => {
    const normalized = normalizeKeepaProduct({
        marketplaceId: MARKETPLACE_ID,
        product: { asin, features },
        fetchedAt: new Date('2026-08-07T12:00:00.000Z'),
    });

    await db.transaction(transaction =>
        persistNormalizedKeepaProduct(transaction, normalized, {
            requestParams: { kind: 'test' },
            responsePayload: null,
            tokensConsumed: null,
            tokensLeft: null,
            refillInMs: null,
            refillRate: null,
        })
    );
};
