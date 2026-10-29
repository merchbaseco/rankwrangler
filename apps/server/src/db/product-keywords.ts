import { sql } from 'drizzle-orm';
import { db } from './index';

export const PRODUCT_KEYWORDS_LIMIT = 200;

/**
 * Keywords a Product is a retained member of, with its organic placement and the keyword's
 * standing. Placement comes from the newest Search run of each page for that keyword; a Product
 * missing from those runs has null placement even if an older run placed it. Pages are 1-based.
 * Ordered by placement, then standing score, then term.
 */
export const listProductKeywords = async (identity: { marketplaceId: string; asin: string }) => {
    const rows = await db.execute<ProductKeywordRow>(sql`
        with memberships as (
            select q.id "queryId",q.display_term keyword,q.normalized_term "normalizedTerm",
                kp.last_observed_at "lastObservedAt",t.popularity_score score,
                coalesce(t.standing_tier,'unrated') tier,pos.page,pos.position
            from products p
            join keyword_products kp on kp.product_id=p.id
            join catalog_queries q on q.id=kp.query_id
            left join discovery_targets t on t.query_id=q.id and t.kind='keyword'
            left join lateral (
                select r.page+1 page,res.source_position position
                from (select distinct on (page) id,page from catalog_search_runs
                    where query_id=q.id order by page,created_at desc,id desc) r
                join catalog_search_results res on res.run_id=r.id and res.product_id=p.id
                order by r.page,res.source_position limit 1
            ) pos on true
            where p.marketplace_id=${identity.marketplaceId} and p.asin=${identity.asin}
        )
        select *,count(*) over()::int total,(count(*) filter(where page=1) over())::int "pageOne"
        from memberships
        order by page nulls last,position nulls last,score desc nulls last,"normalizedTerm"
        limit ${PRODUCT_KEYWORDS_LIMIT}`);
    return {
        keywords: rows.map(({ total: _total, pageOne: _pageOne, ...row }) => ({
            ...row,
            lastObservedAt: utcTimestamp(row.lastObservedAt),
        })),
        totals: { keywords: rows[0]?.total ?? 0, pageOne: rows[0]?.pageOne ?? 0 },
    };
};

interface ProductKeywordRow extends Record<string, unknown> {
    queryId: string;
    keyword: string;
    normalizedTerm: string;
    lastObservedAt: string | Date;
    score: number | null;
    tier: 'unrated' | 'hot' | 'warm' | 'cold';
    page: number | null;
    position: number | null;
    total: number;
    pageOne: number;
}

const utcTimestamp = (value: string | Date) =>
    value instanceof Date
        ? value.toISOString()
        : new Date(`${value.replace(' ', 'T')}Z`).toISOString();
