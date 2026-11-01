import { afterEach, describe, expect, it } from 'bun:test';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { ensureProductIdentities } from '@/db/product/get-products';
import { persistNormalizedKeepaProduct } from '@/db/product/persist-normalized-keepa-product';
import { upsertProductInfo } from '@/db/product/upsert-product';
import { products } from '@/db/schema';
import {
    type KeepaProductPayload,
    normalizeKeepaProduct,
} from '@/services/keepa-product-normalizer';
import type { SpApiProduct } from '@/types';

const MARKETPLACE_ID = 'ATVPDKIKX0DER';
const TEST_ASINS = [
    'B0MERCHDB001',
    'B0MERCHDB002',
    'B0MERCHDB003',
    'B0MERCHDB004',
    'B0MERCHDB005',
] as const;
const TEE_TEMPLATE = 'Lightweight, Classic fit, Double-needle sleeve and bottom hem';
const isDedicatedCatalogTestDatabase =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test';
const describeCatalogDb = isDedicatedCatalogTestDatabase ? describe : describe.skip;

describeCatalogDb('Merch-listing classification persistence', () => {
    afterEach(async () => {
        await db.delete(products).where(inArray(products.asin, TEST_ASINS));
    });

    it('defaults newly ensured Products to non-Merch', async () => {
        await ensureProductIdentities([{ marketplaceId: MARKETPLACE_ID, asin: TEST_ASINS[0] }]);

        expect(await readClassification(TEST_ASINS[0])).toEqual({
            isMerchListing: false,
            bullet1: null,
            bullet2: null,
        });
    });

    it('lets a later SP-API verdict demote and promote, bullets included', async () => {
        await upsertProductInfo(createSpApiProduct(TEST_ASINS[1], true, 'Seller detail'));
        await upsertProductInfo(createSpApiProduct(TEST_ASINS[1], false));
        expect(await readClassification(TEST_ASINS[1])).toEqual({
            isMerchListing: false,
            bullet1: null,
            bullet2: null,
        });

        await upsertProductInfo(createSpApiProduct(TEST_ASINS[1], true, 'New detail', 'Second'));
        expect(await readClassification(TEST_ASINS[1])).toEqual({
            isMerchListing: true,
            bullet1: 'New detail',
            bullet2: 'Second',
        });
    });

    it('lets a decided Keepa observation replace the SP-API verdict', async () => {
        await upsertProductInfo(createSpApiProduct(TEST_ASINS[2], false));
        await persistKeepaProduct({
            asin: TEST_ASINS[2],
            features: [TEE_TEMPLATE, 'Keepa seller detail one', 'Keepa seller detail two'],
        });
        expect(await readClassification(TEST_ASINS[2])).toEqual({
            isMerchListing: true,
            bullet1: 'Keepa seller detail one',
            bullet2: 'Keepa seller detail two',
        });

        await persistKeepaProduct({
            asin: TEST_ASINS[2],
            features: [TEE_TEMPLATE],
            upcList: ['710917774610'],
        });
        expect(await readClassification(TEST_ASINS[2])).toEqual({
            isMerchListing: false,
            bullet1: null,
            bullet2: null,
        });
    });

    it('leaves a stored Product unchanged for an undecided Keepa parent', async () => {
        await upsertProductInfo(createSpApiProduct(TEST_ASINS[3], true, 'Existing seller detail'));
        await persistKeepaProduct({
            asin: TEST_ASINS[3],
            productType: 5,
            features: ['Parent seller bullet'],
        });

        expect(await readClassification(TEST_ASINS[3])).toEqual({
            isMerchListing: true,
            bullet1: 'Existing seller detail',
            bullet2: null,
        });
    });

    it('inserts a new Product as non-Merch from an undecided Keepa parent', async () => {
        await persistKeepaProduct({
            asin: TEST_ASINS[4],
            productType: 5,
            features: ['Parent seller bullet'],
        });

        expect(await readClassification(TEST_ASINS[4])).toEqual({
            isMerchListing: false,
            bullet1: null,
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
    isMerchListing: boolean,
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
    parentAsin: null,
    childAsin: null,
    fetchedAt: '2026-08-07T12:00:00.000Z',
});

const persistKeepaProduct = async (product: KeepaProductPayload) => {
    const normalized = normalizeKeepaProduct({
        marketplaceId: MARKETPLACE_ID,
        product,
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
