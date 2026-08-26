import {
    KEEPA_MAIN_CATEGORY_ID,
    keepaHistoryMetricColumns,
} from '@/services/keepa-history-metrics';
import { dateToKeepaMinute } from '@/services/keepa-product-normalizer';
import { DAY_MS, HOUR_MS, shiftMs } from '@/dev-seed/time-offsets';
import type { BuilderContext, DevSeedPlan, PlanRows, SeedProduct } from '@/dev-seed/types';

/**
 * Keepa change points for the Products the catalog marks as having history, so
 * the Product history chart draws a real curve instead of an empty axis.
 *
 * Keepa records change points, not samples: a value appears only when it moved.
 * Ranks move most days and prices rarely, so the two series are generated at
 * different densities and the chart's carry-in behaviour gets exercised.
 */

const HOURS_PER_RANK_POINT = 6;
const PRICE_CHANGE_RATE = 0.12;
/** One Product carries a category series so `bsrCategory` has something to show. */
const CATEGORY_SERIES_PRODUCTS = 1;

export interface HistoryBuild {
    readonly productHistoryPoints: DevSeedPlan['productHistoryPoints'];
    readonly productHistoryImports: DevSeedPlan['productHistoryImports'];
}

export const buildHistory = (
    context: BuilderContext,
    seedProducts: readonly SeedProduct[]
): HistoryBuild => {
    const { random, now, marketplaceId, mintId, options } = context;
    const points: PlanRows<'productHistoryPoints'> = [];
    const imports: PlanRows<'productHistoryImports'> = [];
    const tracked = seedProducts.filter(product => product.hasHistory);

    tracked.forEach((product, productIndex) => {
        const pointCount = Math.round((options.dayCount * 24) / HOURS_PER_RANK_POINT);
        const baseRank = product.rootCategoryBsr ?? 400_000;
        let rank = Math.max(1, Math.round(baseRank * random.between(1.05, 1.4)));
        let price = product.currentNewPrice + random.int(-400, 400);

        for (let step = pointCount; step >= 0; step -= 1) {
            const observedAt = shiftMs(now, -step * HOURS_PER_RANK_POINT * HOUR_MS);
            // Drift toward the Product's current rank so the series lands where
            // the catalog row says it should.
            const pull = (baseRank - rank) * 0.12;
            rank = Math.max(1, Math.round(rank + pull + random.normal() * baseRank * 0.06));
            points.push({
                id: mintId('historyPoint'),
                productId: product.id,
                marketplaceId,
                asin: product.asin,
                source: 'keepa',
                metric: keepaHistoryMetricColumns.bsrMain,
                categoryId: KEEPA_MAIN_CATEGORY_ID,
                observedAt,
                keepaMinutes: dateToKeepaMinute(observedAt),
                valueInt: rank,
                isMissing: false,
            });

            if (productIndex < CATEGORY_SERIES_PRODUCTS) {
                points.push({
                    id: mintId('historyPoint'),
                    productId: product.id,
                    marketplaceId,
                    asin: product.asin,
                    source: 'keepa',
                    metric: keepaHistoryMetricColumns.bsrCategory,
                    categoryId: product.rootCategoryId,
                    observedAt,
                    keepaMinutes: dateToKeepaMinute(observedAt),
                    valueInt: Math.max(1, Math.round(rank * 0.22)),
                    isMissing: false,
                });
            }

            if (step === pointCount || random.chance(PRICE_CHANGE_RATE)) {
                const outOfStock = random.chance(0.04);
                price = Math.max(999, price + random.int(-250, 250));
                points.push({
                    id: mintId('historyPoint'),
                    productId: product.id,
                    marketplaceId,
                    asin: product.asin,
                    source: 'keepa',
                    metric: keepaHistoryMetricColumns.priceNew,
                    categoryId: KEEPA_MAIN_CATEGORY_ID,
                    observedAt,
                    keepaMinutes: dateToKeepaMinute(observedAt),
                    // A missing point is Keepa's "no offer", and the chart has
                    // to survive one.
                    valueInt: outOfStock ? null : price,
                    isMissing: outOfStock,
                });
            }
        }

        imports.push(
            buildImport({
                context,
                product,
                status: 'success',
                createdAt: product.keepaFetchedAt,
            })
        );
    });

    // One failed import, so the activity surfaces have a real error to render.
    const failing = tracked.at(-1);
    if (failing) {
        imports.push(
            buildImport({
                context,
                product: failing,
                status: 'error',
                createdAt: shiftMs(now, -random.int(2, 5) * DAY_MS),
            })
        );
    }

    return { productHistoryImports: imports, productHistoryPoints: points };
};

const buildImport = ({
    context,
    product,
    status,
    createdAt,
}: {
    context: BuilderContext;
    product: SeedProduct;
    status: 'success' | 'error';
    createdAt: Date;
}): DevSeedPlan['productHistoryImports'][number] => ({
    id: context.mintId('historyImport'),
    productId: product.id,
    marketplaceId: context.marketplaceId,
    asin: product.asin,
    source: 'keepa',
    status,
    requestParams: { asin: product.asin, days: context.options.dayCount, history: 1 },
    responsePayload: status === 'success' ? { tokensConsumed: 1, products: 1 } : null,
    tokensConsumed: status === 'success' ? 1 : 0,
    tokensLeft: context.random.int(120, 1200),
    refillInMs: context.random.int(1000, 60_000),
    refillRate: 5,
    errorCode: status === 'error' ? 'KEEPA_TOKENS_EXHAUSTED' : null,
    errorMessage: status === 'error' ? 'Not enough tokens left to serve the request.' : null,
    createdAt,
});
