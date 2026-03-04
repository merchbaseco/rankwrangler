import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { productFacetKeys, type ProductFacetKey } from '@/services/product-facet-taxonomy.js';

const FACET_METRICS_BUCKET_COUNT = 30;
const FACET_METRICS_BUCKET_INTERVAL_MINUTES = 48;
const FACET_METRICS_WINDOW_MINUTES =
    FACET_METRICS_BUCKET_COUNT * FACET_METRICS_BUCKET_INTERVAL_MINUTES;
const MS_PER_MINUTE = 60_000;
const DECIMAL_NUMBER_REGEX = '^-?([0-9]+(\\.[0-9]+)?|\\.[0-9]+)([eE][+-]?[0-9]+)?$';
const decimalNumberPattern = new RegExp(DECIMAL_NUMBER_REGEX);

type FacetClassificationBucketRow = {
    bucket_start: string;
    assigned: number;
    errors: number;
    spend: number;
};

type FacetCategoryTotalRow = {
    facet: string;
    product_count: number;
};

type FacetValueTotalRow = {
    facet: ProductFacetKey;
    name: string;
    product_count: number;
};

type FacetMetricsStatSeries = {
    label: string;
    total: number;
    buckets: number[];
    format: 'count' | 'usd';
};

export type ProductFacetMetricsResponse = {
    bucketCount: number;
    stats: FacetMetricsStatSeries[];
    facetCategoryTotals: Array<{ facet: ProductFacetKey; productCount: number }>;
    facetValueTotals: Array<{ facet: ProductFacetKey; name: string; productCount: number }>;
};

export const getFacetMetricsWindowStart = (now: Date) =>
    new Date(now.getTime() - FACET_METRICS_WINDOW_MINUTES * MS_PER_MINUTE);

export const getProductFacetMetrics = async (): Promise<ProductFacetMetricsResponse> => {
    const [classificationBuckets, categoryTotalRows, facetValueTotalRows] = await Promise.all([
        queryFacetClassificationBuckets(),
        queryFacetCategoryTotals(),
        queryFacetValueTotals(),
    ]);

    const assignedBuckets = classificationBuckets.map(row => Number(row.assigned ?? 0));
    const errorBuckets = classificationBuckets.map(row => Number(row.errors ?? 0));
    const spendBuckets = classificationBuckets.map(row => Number(row.spend ?? 0));
    const facetCategoryTotals = normalizeFacetCategoryTotals(categoryTotalRows);

    return {
        bucketCount: FACET_METRICS_BUCKET_COUNT,
        stats: [
            {
                label: 'Facets Assigned',
                total: sum(assignedBuckets),
                buckets: assignedBuckets,
                format: 'count',
            },
            {
                label: 'Facets Spend',
                total: sum(spendBuckets),
                buckets: spendBuckets,
                format: 'usd',
            },
            {
                label: 'Facets Errors',
                total: sum(errorBuckets),
                buckets: errorBuckets,
                format: 'count',
            },
        ],
        facetCategoryTotals,
        facetValueTotals: facetValueTotalRows.map(row => ({
            facet: row.facet,
            name: row.name,
            productCount: Number(row.product_count ?? 0),
        })),
    };
};

export const normalizeFacetCategoryTotals = (rows: FacetCategoryTotalRow[]) => {
    const countsByFacet = new Map<ProductFacetKey, number>();

    for (const row of rows) {
        if (!isProductFacetKey(row.facet)) {
            continue;
        }
        countsByFacet.set(row.facet, Number(row.product_count ?? 0));
    }

    return productFacetKeys.map((facet) => ({
        facet,
        productCount: countsByFacet.get(facet) ?? 0,
    }));
};

const queryFacetClassificationBuckets = async () => {
    const rows = await db.execute<FacetClassificationBucketRow>(sql`
        WITH bucket_indices AS (
            SELECT generate_series(0::int, ${FACET_METRICS_BUCKET_COUNT - 1}::int) AS idx
        ),
        window_anchor AS (
            SELECT
                now()::timestamp
                    - (${FACET_METRICS_WINDOW_MINUTES}::int * interval '1 minute') AS window_start
        ),
        buckets AS (
            SELECT
                wa.window_start
                    + (idx * ${FACET_METRICS_BUCKET_INTERVAL_MINUTES}::int * interval '1 minute')
                    AS bucket_start
            FROM bucket_indices
            CROSS JOIN window_anchor wa
        )
        SELECT
            b.bucket_start::text,
            coalesce(count(el.id) FILTER (WHERE el.status = 'success'), 0)::int AS assigned,
            coalesce(count(el.id) FILTER (WHERE el.status = 'failed'), 0)::int AS errors,
            coalesce(
                sum(
                    CASE
                        WHEN jsonb_typeof(el.details_json -> 'costUsd') = 'number'
                            THEN (el.details_json ->> 'costUsd')::double precision
                        WHEN jsonb_typeof(el.details_json -> 'costUsd') = 'string'
                            AND (el.details_json ->> 'costUsd') ~ ${DECIMAL_NUMBER_REGEX}
                            THEN (el.details_json ->> 'costUsd')::double precision
                        ELSE 0
                    END
                ),
                0
            )::double precision AS spend
        FROM buckets b
        LEFT JOIN event_logs el
            ON el.account_id = 'global'
            AND el.category = 'product'
            AND el.action = 'product.facets.classify'
            AND el.occurred_at >= b.bucket_start
            AND el.occurred_at < b.bucket_start
                + (${FACET_METRICS_BUCKET_INTERVAL_MINUTES}::int * interval '1 minute')
        GROUP BY b.bucket_start
        ORDER BY b.bucket_start
    `);

    return [...rows];
};

const queryFacetCategoryTotals = async () => {
    const rows = await db.execute<FacetCategoryTotalRow>(sql`
        SELECT
            pfv.facet,
            count(DISTINCT pf.product_id)::int AS product_count
        FROM product_facet_values pfv
        LEFT JOIN product_facets pf
            ON pf.facet_value_id = pfv.id
        GROUP BY pfv.facet
    `);

    return [...rows];
};

const queryFacetValueTotals = async () => {
    const rows = await db.execute<FacetValueTotalRow>(sql`
        SELECT
            pfv.facet,
            pfv.name,
            count(DISTINCT pf.product_id)::int AS product_count
        FROM product_facet_values pfv
        LEFT JOIN product_facets pf
            ON pf.facet_value_id = pfv.id
        GROUP BY pfv.id, pfv.facet, pfv.name
        HAVING count(DISTINCT pf.product_id) > 0
        ORDER BY product_count DESC, pfv.facet ASC, pfv.name ASC
    `);

    return [...rows];
};

const isProductFacetKey = (value: string): value is ProductFacetKey => {
    return productFacetKeys.some(facet => facet === value);
};

export const isFacetCostNumericValue = (value: string) => decimalNumberPattern.test(value);

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
