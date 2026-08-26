/**
 * The Keepa history metrics and the names they are stored under.
 *
 * The API speaks the camel-case key and `product_history_points.metric` holds
 * the snake-case column name; the two are not interchangeable, and a writer
 * that stores the wrong one produces a series no reader can find. Keeping both
 * halves in one env-free module means every producer and consumer — the Keepa
 * ingestion path, the API input schema, the development seed — shares a single
 * definition instead of each spelling it out.
 */

export const keepaHistoryMetricKeys = [
    'bsrMain',
    'bsrCategory',
    'priceAmazon',
    'priceNew',
    'priceNewFba',
] as const;

export type KeepaHistoryMetricKey = (typeof keepaHistoryMetricKeys)[number];

/** Maps an API metric key to the value stored in `product_history_points.metric`. */
export const keepaHistoryMetricColumns: Record<KeepaHistoryMetricKey, string> = {
    bsrMain: 'bsr_main',
    bsrCategory: 'bsr_category',
    priceAmazon: 'price_amazon',
    priceNew: 'price_new',
    priceNewFba: 'price_new_fba',
};

/** The category id a metric that is not category-scoped is stored under. */
export const KEEPA_MAIN_CATEGORY_ID = -1;
