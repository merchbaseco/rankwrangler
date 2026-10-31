import { type SQL, sql } from 'drizzle-orm';
import {
    dominantFacetQuery,
    KEYWORD_FRESH_DAYS,
    KEYWORD_SHELF_SIZE,
} from './keyword-directory-sort';
import { storedShortName } from './product/product-stored-enrichment';

export const SCORE_TREND_WEEKS = 12;
const DAY_MS = 86_400_000;

/**
 * Research detail columns for directory rows, as correlated subqueries over `queryId`: the top-ten
 * Merch shelf, the dominant facet, and score history from keyword_standing_observations. The page
 * read selects them for its returned rows only, so detail costs no extra round trip;
 * `withKeywordDetail` shapes them.
 */
export const keywordDetailColumns = (queryId: SQL, asOf: string) => sql`
    ${keywordShelfColumns(queryId, asOf)},
    (select to_jsonb(f) from (${dominantFacetQuery(queryId)}) f) "detailFacet",
    (select o.popularity_score from keyword_standing_observations o
        where o.query_id=${queryId} and o.observed_at<=${asOf}::timestamp-interval '7 days'
        order by o.observed_at desc limit 1) "detailScore7d"`;

/**
 * The shelf and weekly score trend alone, for reads that list a keyword without its facet or
 * seven-day change (a Product's keywords): the top-ten Merch shelf in page-one order with each
 * Product's stored short name, and twelve weekly scores. `withShelfDetail` shapes them.
 */
export const keywordShelfColumns = (queryId: SQL, asOf: string) => sql`
    coalesce((select jsonb_agg(s order by s.ord) from (
        select h.ord,pr.marketplace_id "marketplaceId",pr.asin,pr.title,
            pr.root_category_bsr "salesRank",pr.thumbnail_url "thumbnailUrl",
            pr.date_first_available "firstAvailableAt",sn.state "shortNameState",
            sn.short_name "shortName",sn.input_fingerprint "shortNameFingerprint"
        from discovery_targets t
        cross join jsonb_array_elements_text(t.head_product_ids) with ordinality h(id,ord)
        join products pr on pr.id=h.id::uuid
        left join product_short_names sn on sn.marketplace_id=pr.marketplace_id and sn.asin=pr.asin
        where t.query_id=${queryId} and t.kind='keyword'
            and pr.is_merch_listing=true and pr.amazon_listing_status='active'
        order by h.ord limit ${KEYWORD_SHELF_SIZE}) s),'[]'::jsonb) "detailShelf",
    coalesce((select jsonb_agg(jsonb_build_array(w.back,o.popularity_score) order by w.back desc)
        from generate_series(${SCORE_TREND_WEEKS - 1}::int,0,-1) w(back)
        cross join lateral (select popularity_score from keyword_standing_observations
            where query_id=${queryId} and observed_at<=${asOf}::timestamp-w.back*interval '7 days'
            order by observed_at desc limit 1) o),'[]'::jsonb) "detailTrend"`;

/**
 * Shapes `keywordDetailColumns` for one row: the shelf detail (`withShelfDetail`), the dominant
 * facet and the seven-day score change.
 */
export const withKeywordDetail = <T extends DetailColumns & { score: number | null }>(
    row: T,
    asOf: string
) => {
    const { detailFacet, detailScore7d, ...rest } = row;
    const item = withShelfDetail(rest, asOf);
    return {
        ...item,
        facet: detailFacet,
        scoreDelta7d:
            item.score === null || detailScore7d === null ? null : item.score - detailScore7d,
    };
};

/**
 * Shapes `keywordShelfColumns` for one row: the shelf with current short names, its median BSR
 * and fresh count, and the weekly trend.
 */
export const withShelfDetail = <T extends ShelfColumns>(row: T, asOf: string) => {
    const { detailShelf, detailTrend, ...item } = row;
    const asOfMs = new Date(asOf).getTime();
    const freshAfter = asOfMs - KEYWORD_FRESH_DAYS * DAY_MS;
    const shelf = detailShelf.map(product => ({
        asin: product.asin,
        salesRank: product.salesRank,
        thumbnailUrl: product.thumbnailUrl,
        shortName: storedShortName(product, product),
        title: product.title,
        firstAvailableAt: product.firstAvailableAt ? utcTimestamp(product.firstAvailableAt) : null,
    }));
    return {
        ...item,
        shelf,
        medianBsr: median(shelf.flatMap(product => product.salesRank ?? [])),
        freshCount: shelf.filter(
            product =>
                product.firstAvailableAt &&
                new Date(product.firstAvailableAt).getTime() >= freshAfter
        ).length,
        scoreTrend12w: detailTrend.flatMap(([back, score]) =>
            score === null
                ? []
                : [{ at: new Date(asOfMs - back * 7 * DAY_MS).toISOString(), score }]
        ),
    };
};

export type ShelfColumns = {
    detailShelf: ShelfRow[];
    detailTrend: [number, number | null][];
};

export type DetailColumns = ShelfColumns & {
    detailFacet: { facet: string; name: string } | null;
    detailScore7d: number | null;
};

interface ShelfRow {
    marketplaceId: string;
    asin: string;
    title: string | null;
    salesRank: number | null;
    thumbnailUrl: string | null;
    firstAvailableAt: string | null;
    shortNameState: string | null;
    shortName: string | null;
    shortNameFingerprint: string | null;
}

/** Matches the directory sort: middle value, or the rounded mean of the two middle values. */
const median = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

const utcTimestamp = (value: string) =>
    new Date(
        /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`
    ).toISOString();
