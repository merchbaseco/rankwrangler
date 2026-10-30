import { sql } from 'drizzle-orm';
import { db } from './index';
import {
    dominantFacetQuery,
    KEYWORD_FRESH_DAYS,
    KEYWORD_SHELF_SIZE,
} from './keyword-directory-sort';
import { storedShortName } from './product/product-stored-enrichment';

export const SCORE_TREND_WEEKS = 12;
const DAY_MS = 86_400_000;

/**
 * Research detail for one directory page: the top-ten Merch shelf in page-one order, its median
 * BSR and fresh count, the dominant facet, and score history from keyword_standing_observations,
 * with each shelf Product's stored short name, in one statement for the page.
 */
export const readKeywordDirectoryDetail = async <
    T extends { queryId: string | null; score: number | null },
>(
    items: readonly T[],
    asOf: string
) => {
    const queryIds = items.flatMap(item => (item.queryId ? [item.queryId] : []));
    const rows = queryIds.length
        ? await db.execute<DetailRow>(sql`
        select q.id "queryId",
            coalesce((select jsonb_agg(s order by s.ord) from (
                select h.ord,pr.marketplace_id "marketplaceId",pr.asin,pr.title,
                    pr.root_category_bsr "salesRank",pr.thumbnail_url "thumbnailUrl",
                    pr.date_first_available "firstAvailableAt",sn.state "shortNameState",
                    sn.short_name "shortName",sn.input_fingerprint "shortNameFingerprint"
                from discovery_targets t
                cross join jsonb_array_elements_text(t.head_product_ids) with ordinality h(id,ord)
                join products pr on pr.id=h.id::uuid
                left join product_short_names sn on sn.marketplace_id=pr.marketplace_id
                    and sn.asin=pr.asin
                where t.query_id=q.id and t.kind='keyword'
                    and pr.is_merch_listing=true and pr.amazon_listing_status='active'
                order by h.ord limit ${KEYWORD_SHELF_SIZE}) s),'[]'::jsonb) shelf,
            (select to_jsonb(f) from (${dominantFacetQuery(sql`q.id`)}) f) facet,
            (select o.popularity_score from keyword_standing_observations o
                where o.query_id=q.id and o.observed_at<=${asOf}::timestamp-interval '7 days'
                order by o.observed_at desc limit 1) "score7d",
            coalesce((select jsonb_agg(jsonb_build_array(w.back,o.popularity_score) order by w.back desc)
                from generate_series(${SCORE_TREND_WEEKS - 1}::int,0,-1) w(back)
                cross join lateral (select popularity_score from keyword_standing_observations
                    where query_id=q.id and observed_at<=${asOf}::timestamp-w.back*interval '7 days'
                    order by observed_at desc limit 1) o),'[]'::jsonb) trend
        from catalog_queries q where q.id in (${sql.join(
            queryIds.map(id => sql`${id}::uuid`),
            sql`,`
        )})`)
        : [];
    const byQuery = new Map(rows.map(row => [row.queryId, row]));
    const asOfMs = new Date(asOf).getTime();
    const freshAfter = asOfMs - KEYWORD_FRESH_DAYS * DAY_MS;
    return items.map(item => {
        const row = item.queryId ? byQuery.get(item.queryId) : undefined;
        const shelf = (row?.shelf ?? []).map(product => ({
            asin: product.asin,
            salesRank: product.salesRank,
            thumbnailUrl: product.thumbnailUrl,
            shortName: storedShortName(product, product),
            title: product.title,
            firstAvailableAt: product.firstAvailableAt
                ? utcTimestamp(product.firstAvailableAt)
                : null,
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
            facet: row?.facet ?? null,
            scoreDelta7d:
                item.score === null || row?.score7d == null ? null : item.score - row.score7d,
            scoreTrend12w: (row?.trend ?? []).flatMap(([back, score]) =>
                score === null
                    ? []
                    : [{ at: new Date(asOfMs - back * 7 * DAY_MS).toISOString(), score }]
            ),
        };
    });
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

interface DetailRow extends Record<string, unknown> {
    queryId: string;
    shelf: ShelfRow[];
    facet: { facet: string; name: string } | null;
    score7d: number | null;
    trend: [number, number | null][];
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
