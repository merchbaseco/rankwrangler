import { DAY_MS, HOUR_MS, shiftMs } from '@/dev-seed/time-offsets';
import type { BuilderContext, DevSeedPlan, PlanRows, SeedProduct } from '@/dev-seed/types';
import {
    KEEPA_MAIN_CATEGORY_ID,
    keepaHistoryMetricColumns,
} from '@/services/keepa-history-metrics';
import {
    buildKeepaHistorySeries,
    dateToKeepaMinute,
    KEEPA_MISSING_VALUE,
} from '@/services/keepa-history-series';

/**
 * Keepa change points for the Products the catalog marks as having history, so
 * the Product history chart draws a real curve instead of an empty axis.
 *
 * Keepa records change points, not samples: a value appears only when it moved.
 * Ranks move most days and prices rarely, so the two series are generated at
 * different densities and the chart's carry-in behaviour gets exercised.
 */

const HOURS_PER_RANK_POINT = 6;
/** Daily rank points before the dense week, so the 30-day sparkline spans its window. */
const SPARKLINE_DAYS = 30;
/** Sparser rank points back to 90 days, so the preview's 90-day chart is drawn, not carried in. */
const QUARTER_DAYS = 90;
const QUARTER_STEP_DAYS = 3;
/** One old peak per Product, so best-ever BSR differs from the recent range. */
const PEAK_DAYS_AGO = 180;
const PRICE_CHANGE_RATE = 0.12;
/** One Product carries a category series so `bsrCategory` has something to show. */
const CATEGORY_SERIES_PRODUCTS = 1;

export interface HistoryBuild {
    readonly productHistorySeries: DevSeedPlan['productHistorySeries'];
    readonly productHistoryImports: DevSeedPlan['productHistoryImports'];
}

export const buildHistory = (
    context: BuilderContext,
    seedProducts: readonly SeedProduct[]
): HistoryBuild => {
    const { random, now, options } = context;
    const series: PlanRows<'productHistorySeries'> = [];
    const imports: PlanRows<'productHistoryImports'> = [];
    const tracked = seedProducts.filter(product => product.hasHistory);

    tracked.forEach((product, productIndex) => {
        const pointCount = Math.round((options.dayCount * 24) / HOURS_PER_RANK_POINT);
        const baseRank = product.rootCategoryBsr ?? 400_000;
        let rank = Math.max(1, Math.round(baseRank * random.between(1.05, 1.4)));
        let price = product.currentNewPrice + random.int(-400, 400);
        const rankPairs: [number, number][] = [];
        const categoryPairs: [number, number][] = [];
        const pricePairs: [number, number][] = [];
        const rankPoint = (observedAt: Date, value: number) => {
            rankPairs.push([dateToKeepaMinute(observedAt), value]);
        };
        rankPoint(
            shiftMs(now, -PEAK_DAYS_AGO * DAY_MS),
            Math.max(1, Math.round(baseRank * random.between(0.25, 0.5)))
        );
        for (let day = QUARTER_DAYS; day > SPARKLINE_DAYS; day -= QUARTER_STEP_DAYS) {
            rank = Math.max(1, Math.round(rank * random.between(0.88, 1.12)));
            rankPoint(shiftMs(now, -day * DAY_MS), rank);
        }
        for (let day = SPARKLINE_DAYS; day > options.dayCount; day -= 1) {
            rank = Math.max(1, Math.round(rank * random.between(0.85, 1.15)));
            rankPoint(shiftMs(now, -day * DAY_MS), rank);
        }

        for (let step = pointCount; step >= 0; step -= 1) {
            const observedAt = shiftMs(now, -step * HOURS_PER_RANK_POINT * HOUR_MS);
            // Drift toward the Product's current rank so the series lands where
            // the catalog row says it should.
            const pull = (baseRank - rank) * 0.12;
            rank = Math.max(1, Math.round(rank + pull + random.normal() * baseRank * 0.06));
            rankPoint(observedAt, rank);

            if (productIndex < CATEGORY_SERIES_PRODUCTS) {
                categoryPairs.push([
                    dateToKeepaMinute(observedAt),
                    Math.max(1, Math.round(rank * 0.22)),
                ]);
            }

            if (step === pointCount || random.chance(PRICE_CHANGE_RATE)) {
                const outOfStock = random.chance(0.04);
                price = Math.max(999, price + random.int(-250, 250));
                // A missing point is Keepa's "no offer", and the chart has to survive one.
                pricePairs.push([
                    dateToKeepaMinute(observedAt),
                    outOfStock ? KEEPA_MISSING_VALUE : price,
                ]);
            }
        }

        for (const built of [
            buildKeepaHistorySeries(
                keepaHistoryMetricColumns.bsrMain,
                KEEPA_MAIN_CATEGORY_ID,
                rankPairs
            ),
            buildKeepaHistorySeries(
                keepaHistoryMetricColumns.bsrCategory,
                product.rootCategoryId,
                categoryPairs
            ),
            buildKeepaHistorySeries(
                keepaHistoryMetricColumns.priceNew,
                KEEPA_MAIN_CATEGORY_ID,
                pricePairs
            ),
        ]) {
            if (!built) continue;
            series.push({
                productId: product.id,
                source: 'keepa',
                metric: built.metric,
                categoryId: built.categoryId,
                keepaMinutes: [...built.keepaMinutes],
                keepaValues: [...built.values],
            });
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

    // Keepa answered for the history-less Products too, just with no rank series:
    // without a successful import the Product page reads them as never synced
    // and starts a real Keepa refresh on open.
    for (const product of seedProducts) {
        if (!product.hasHistory) {
            imports.push(
                buildImport({
                    context,
                    product,
                    status: 'success',
                    createdAt: product.keepaFetchedAt,
                })
            );
        }
    }

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

    return { productHistoryImports: imports, productHistorySeries: series };
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
