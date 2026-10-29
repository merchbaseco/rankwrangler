import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { persistNormalizedKeepaProduct } from '@/db/product/persist-normalized-keepa-product';
import {
    countProductHistoryPoints,
    writeProductHistorySeries,
} from '@/db/product/product-history-series';
import { keepaCategories, productHistorySeries, products } from '@/db/schema';
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
