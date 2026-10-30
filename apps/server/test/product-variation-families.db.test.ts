import { afterEach, describe, expect, it } from 'bun:test';
import { and, eq, inArray, like } from 'drizzle-orm';
import { db } from '@/db/index';
import { ensureProductIdentities } from '@/db/product/get-products';
import { keepaRequestAsin } from '@/db/product/keepa-request-asin';
import { persistNormalizedKeepaProduct } from '@/db/product/persist-normalized-keepa-product';
import { familyIdentityKey, resolveFamilyIdentities } from '@/db/product/product-family';
import { upsertProductInfo, upsertProductsInfo } from '@/db/product/upsert-product';
import {
    productAsinAliases,
    productHistorySeries,
    products,
    productShortNames,
    spApiSyncQueue,
} from '@/db/schema';
import { normalizeKeepaProduct } from '@/services/keepa-product-normalizer';
import type { SpApiProduct } from '@/types';

const M = 'ATVPDKIKX0DER';
const PARENT = 'B0FAMPARENT';
const SMALL = 'B0FAMSMALL1';
const LARGE = 'B0FAMLARGE1';
const describeCatalogDb =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test'
        ? describe
        : describe.skip;

describeCatalogDb('Product variation families', () => {
    afterEach(async () => {
        await db.delete(spApiSyncQueue).where(like(spApiSyncQueue.asin, 'B0FAM%'));
        await db.delete(products).where(like(products.asin, 'B0FAM%'));
    });

    it('stores a variant under its parent, aliases it, and queues the parent fetch', async () => {
        const [identity] = await upsertProductsInfo([variant(SMALL, 'Shirt, Men, Black, Small')]);
        expect(identity).toMatchObject({ asin: PARENT, sourceAsin: SMALL, inserted: true });
        expect(await readFamily()).toMatchObject({
            asin: PARENT,
            representativeAsin: SMALL,
            title: 'Shirt, Men, Black, Small',
            rootCategoryBsr: 12_525,
        });
        expect(await aliasesOf(identity.id)).toEqual([SMALL]);
        expect(await queued()).toEqual([PARENT]);

        const [second] = await upsertProductsInfo([variant(LARGE, 'Shirt, Men, Black, Large')]);
        expect(second.id).toBe(identity.id);
        expect(await aliasesOf(identity.id)).toEqual([LARGE, SMALL]);
        expect(await db.select().from(products).where(like(products.asin, 'B0FAM%'))).toHaveLength(1);

        const families = await resolveFamilyIdentities(db, [{ marketplaceId: M, asin: LARGE }]);
        expect(families.get(familyIdentityKey({ marketplaceId: M, asin: LARGE }))?.asin).toBe(PARENT);
        expect(await ensureProductIdentities([{ marketplaceId: M, asin: LARGE }])).toBe(0);
    });

    it('lets the parent refresh replace the variant title but keep the representative', async () => {
        await upsertProductInfo(variant(SMALL, 'Shirt, Men, Black, Small'));
        await upsertProductInfo({ ...variant(PARENT, 'Shirt'), parentAsin: null, childAsin: LARGE });
        expect(await readFamily()).toMatchObject({ title: 'Shirt', representativeAsin: SMALL });
        await upsertProductInfo(variant(LARGE, 'Shirt, Men, Black, Large'));
        expect((await readFamily())?.title).toBe('Shirt');
    });

    it('folds duplicate variant rows stored before variations were known', async () => {
        await upsertProductsInfo([
            { ...variant(SMALL, 'Small'), parentAsin: null },
            { ...variant(LARGE, 'Large'), parentAsin: null },
        ]);
        const [small] = await db.select().from(products).where(eq(products.asin, SMALL));
        const [large] = await db.select().from(products).where(eq(products.asin, LARGE));
        await db.update(products).set({
            keepaFetchedAt: new Date('2026-10-01T00:00:00Z'),
            keepaFirstTrackedAt: new Date('2024-01-01T00:00:00Z'),
        }).where(eq(products.id, large.id));
        await db.insert(productHistorySeries).values([
            series(small.id, [1, 2]),
            series(large.id, [1, 2, 3]),
        ]);
        await db.insert(productShortNames).values({
            marketplaceId: M,
            asin: SMALL,
            inputFingerprint: 'fingerprint',
            state: 'pending',
            claimId: crypto.randomUUID(),
            attemptedAt: new Date('2026-10-30T00:00:00Z'),
        });

        await upsertProductInfo(variant(SMALL, 'Small'));
        await upsertProductInfo(variant(LARGE, 'Large'));

        const family = await readFamily();
        expect(family?.id).toBe(large.id);
        expect(family?.keepaFirstTrackedAt).toEqual(new Date('2024-01-01T00:00:00Z'));
        expect(await db.select().from(products).where(eq(products.id, small.id))).toHaveLength(0);
        expect(
            (await db.select().from(productHistorySeries).where(eq(productHistorySeries.productId, large.id)))
                .map(row => row.keepaMinutes)
        ).toEqual([[1, 2, 3]]);
        expect(
            (await db.select().from(productShortNames).where(like(productShortNames.asin, 'B0FAM%')))
                .map(row => row.asin)
        ).toEqual([PARENT]);
        expect(await aliasesOf(large.id)).toEqual([LARGE, SMALL]);
        // The surviving row kept a variant's title, so the parent listing is fetched for its own.
        expect(
            (await db.select().from(spApiSyncQueue).where(eq(spApiSyncQueue.asin, PARENT))).map(
                row => row.asin
            )
        ).toEqual([PARENT]);
    });

    it('asks Keepa through the representative and writes its answer to the family', async () => {
        await upsertProductInfo(variant(SMALL, 'Shirt, Men, Black, Small'));
        const [row] = await db
            .select({ keepaAsin: keepaRequestAsin })
            .from(products)
            .where(eq(products.asin, PARENT));
        expect(row.keepaAsin).toBe(SMALL);

        const normalized = normalizeKeepaProduct({
            marketplaceId: M,
            product: { asin: SMALL, parentAsin: PARENT, monthlySold: 1000 },
            fetchedAt: new Date('2026-10-30T00:00:00Z'),
        });
        await db.transaction(tx =>
            persistNormalizedKeepaProduct(tx, normalized, {
                requestParams: { kind: 'test' },
                responsePayload: null,
                tokensConsumed: null,
                tokensLeft: null,
                refillInMs: null,
                refillRate: null,
            })
        );
        expect(await readFamily()).toMatchObject({ asin: PARENT, keepaMonthlySold: 1000 });
        expect(await db.select().from(products).where(like(products.asin, 'B0FAM%'))).toHaveLength(1);
    });
});

const variant = (asin: string, title: string): SpApiProduct => ({
    asin,
    marketplaceId: M,
    dateFirstAvailable: null,
    title,
    brand: 'Brand',
    isMerchListing: true,
    bullet1: null,
    bullet2: null,
    rootCategoryId: 7141123011,
    rootCategoryBsr: 12_525,
    thumbnailUrl: null,
    keepa: null,
    parentAsin: PARENT,
    childAsin: null,
    fetchedAt: '2026-10-30T00:00:00.000Z',
});

const series = (productId: string, minutes: number[]) => ({
    productId,
    source: 'keepa',
    metric: 'salesRank',
    keepaMinutes: minutes,
    keepaValues: minutes,
});

const readFamily = async () =>
    (await db.select().from(products).where(and(eq(products.marketplaceId, M), eq(products.asin, PARENT))))[0];

const aliasesOf = async (productId: string) =>
    (
        await db
            .select({ asin: productAsinAliases.asin })
            .from(productAsinAliases)
            .where(eq(productAsinAliases.productId, productId))
    )
        .map(row => row.asin)
        .sort();

const queued = async () =>
    (
        await db
            .select({ asin: spApiSyncQueue.asin })
            .from(spApiSyncQueue)
            .where(inArray(spApiSyncQueue.asin, [PARENT, SMALL, LARGE]))
    ).map(row => row.asin);
