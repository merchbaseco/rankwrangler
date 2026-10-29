import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    backfillProductHistorySeries,
    countProductsMissingHistorySeries,
} from '@/db/product/backfill-product-history-series';
import { persistNormalizedKeepaProduct } from '@/db/product/persist-normalized-keepa-product';
import {
    countProductHistoryPoints,
    writeProductHistorySeries,
} from '@/db/product/product-history-series';
import { keepaCategories, productHistoryPoints, productHistorySeries, products } from '@/db/schema';
import { getProductHistoryPoints } from '@/services/keepa';
import { keepaMinuteToDate } from '@/services/keepa-history-series';
import {
    type KeepaProductPayload,
    normalizeKeepaProduct,
} from '@/services/keepa-product-normalizer';

const market = 'ATVPDKIKX0DER';
const asin = 'B0SERIES01';

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('Product history series', () => {
    beforeEach(async () => {
        if (
            process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
            process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
        ) {
            throw new Error('History series tests require the private loopback database.');
        }
        await db.execute(sql`truncate products, keepa_categories cascade`);
        await db.insert(keepaCategories).values([
            { marketplaceId: market, categoryId: 77, name: 'Novelty' },
            { marketplaceId: market, categoryId: 88, name: 'Shirts' },
        ]);
    });

    it('stores a Keepa payload as series and reads back the same points', async () => {
        await persist({
            asin,
            salesRankReference: 77,
            csv: [[], [100, 1_999, 200, -1, 300, 2_499], [], [100, 9_000, 300, 8_000]],
            salesRanks: { '88': [100, 40, 250, 30] },
        });

        const price = await getProductHistoryPoints({
            marketplaceId: market,
            asin,
            metric: 'priceNew',
            limit: 10,
        });
        expect(price.points).toEqual([
            point(-1, null, 100, 1_999),
            point(-1, null, 200, null),
            point(-1, null, 300, 2_499),
        ]);

        const categories = await getProductHistoryPoints({
            marketplaceId: market,
            asin,
            metric: 'bsrCategory',
            startAt: keepaMinuteToDate(200),
            limit: 1,
        });
        expect(categories.points).toEqual([
            point(88, 'Shirts', 100, 40),
            point(88, 'Shirts', 250, 30),
        ]);

        const main = await getProductHistoryPoints({
            marketplaceId: market,
            asin,
            metric: 'bsrMain',
            categoryId: 77,
            limit: 1,
        });
        expect(main.points).toEqual([point(77, 'Novelty', 300, 8_000)]);
    });

    it('merges a later fetch into the stored series instead of truncating it', async () => {
        await persist({ asin, csv: [[], [100, 1_000, 200, 1_100]] });
        await persist({ asin, csv: [[], [200, 1_150, 300, 1_200]] });

        const [stored] = await db
            .select({
                keepaMinutes: productHistorySeries.keepaMinutes,
                values: productHistorySeries.keepaValues,
            })
            .from(productHistorySeries)
            .where(eq(productHistorySeries.metric, 'price_new'));
        expect(stored).toEqual({ keepaMinutes: [100, 200, 300], values: [1_000, 1_150, 1_200] });

        const [product] = await db.select({ id: products.id }).from(products);
        expect(await countProductHistoryPoints(product.id, 'keepa')).toEqual({ price_new: 3 });
    });

    it('backfills old points in resumable batches, keeping newer series values', async () => {
        const first = await insertProduct('B0SERIES02');
        const second = await insertProduct('B0SERIES03');
        await db
            .insert(productHistoryPoints)
            .values([
                oldPoint(first, 'B0SERIES02', 'bsr_main', 77, 300, 5_000),
                oldPoint(first, 'B0SERIES02', 'bsr_main', 77, 100, 7_000),
                oldPoint(first, 'B0SERIES02', 'price_new', -1, 100, null),
                oldPoint(second, 'B0SERIES03', 'price_new', -1, 100, 1_999),
                oldPoint(second, 'B0SERIES03', 'price_new', -1, 200, 2_099),
            ]);
        // A fetch after the deploy already wrote this Product's series; it wins shared minutes.
        await writeProductHistorySeries(
            db,
            second,
            [
                {
                    metric: 'price_new',
                    categoryId: -1,
                    keepaMinutes: [200, 400],
                    values: [2_199, 2_299],
                },
            ],
            { source: 'keepa', prefer: 'incoming' }
        );
        expect(await countProductsMissingHistorySeries()).toBe(1);

        const [lowId, highId] = [first, second].sort();
        const partial = await backfillProductHistorySeries({ batchSize: 1, limit: 1 });
        expect(partial).toMatchObject({ products: 1, lastProductId: lowId });
        const rest = await backfillProductHistorySeries({ afterProductId: lowId, batchSize: 1 });
        expect(rest).toMatchObject({ products: 1, lastProductId: highId });

        const expected = [
            {
                productId: first,
                metric: 'bsr_main',
                categoryId: 77,
                keepaMinutes: [100, 300],
                keepaValues: [7_000, 5_000],
            },
            {
                productId: first,
                metric: 'price_new',
                categoryId: -1,
                keepaMinutes: [100],
                keepaValues: [-1],
            },
            {
                productId: second,
                metric: 'price_new',
                categoryId: -1,
                keepaMinutes: [100, 200, 400],
                keepaValues: [1_999, 2_199, 2_299],
            },
        ].sort((left, right) =>
            left.productId === right.productId ? 0 : left.productId < right.productId ? -1 : 1
        );
        expect(await readSeries()).toEqual(expected);
        expect(await countProductsMissingHistorySeries()).toBe(0);

        await backfillProductHistorySeries({ batchSize: 10 });
        expect(await readSeries()).toEqual(expected);
    });
});

const persist = async (payload: KeepaProductPayload) => {
    const normalized = normalizeKeepaProduct({
        marketplaceId: market,
        product: payload,
        fetchedAt: new Date('2026-10-28T12:00:00Z'),
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

const point = (
    categoryId: number,
    categoryName: string | null,
    keepaMinutes: number,
    value: number | null
) => ({
    categoryId,
    categoryName,
    observedAt: keepaMinuteToDate(keepaMinutes).toISOString(),
    keepaMinutes,
    value,
    isMissing: value === null,
});

const insertProduct = async (productAsin: string) => {
    const [row] = await db
        .insert(products)
        .values({ marketplaceId: market, asin: productAsin })
        .returning({ id: products.id });
    return row.id;
};

const oldPoint = (
    productId: string,
    productAsin: string,
    metric: string,
    categoryId: number,
    keepaMinutes: number,
    valueInt: number | null
) => ({
    productId,
    marketplaceId: market,
    asin: productAsin,
    source: 'keepa',
    metric,
    categoryId,
    observedAt: keepaMinuteToDate(keepaMinutes),
    keepaMinutes,
    valueInt,
    isMissing: valueInt === null,
});

const readSeries = async () =>
    await db
        .select({
            productId: productHistorySeries.productId,
            metric: productHistorySeries.metric,
            categoryId: productHistorySeries.categoryId,
            keepaMinutes: productHistorySeries.keepaMinutes,
            keepaValues: productHistorySeries.keepaValues,
        })
        .from(productHistorySeries)
        .orderBy(productHistorySeries.productId, productHistorySeries.metric);
