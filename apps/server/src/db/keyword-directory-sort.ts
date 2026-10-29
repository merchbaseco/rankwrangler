import { type SQL, sql } from 'drizzle-orm';
import type { AppKeywordDirectoryInput } from '@/api/keyword-directory-input';
import { bsrTierMax } from '@/services/bsr-tiers';

export const KEYWORD_SHELF_SIZE = 10;
export const KEYWORD_FRESH_DAYS = 60;

type Sort = AppKeywordDirectoryInput['sort'];

/**
 * Shelf and facet measures the research sorts, sidebar filters and facet counts need. Each lateral
 * runs only when the request sorts, filters or counts by it (`shelf: true`), so the default
 * work-ordered directory pays nothing extra. The shelf is the first ten active Merch head
 * Products in page-one order; `elite` counts its Elite-tier Products.
 */
export const directoryMeasures = (input: {
    sort: Sort;
    facet?: string;
    asOf: string;
    shelf?: boolean;
}) => {
    const shelf =
        input.shelf || input.sort === 'medianBsr' || input.sort === 'fresh'
            ? sql`left join lateral (
                select round(percentile_cont(0.5) within group (order by s.bsr))::int median_bsr,
                    count(*) filter(where s.first_available>=${input.asOf}::timestamp-${KEYWORD_FRESH_DAYS}*interval '1 day')::int fresh,
                    count(*) filter(where s.bsr between 1 and ${sql.raw(String(bsrTierMax.elite))})::int elite
                from (select pr.root_category_bsr bsr,pr.date_first_available first_available
                    from discovery_targets ht
                    cross join jsonb_array_elements_text(ht.head_product_ids) with ordinality h(id,ord)
                    join products pr on pr.id=h.id::uuid
                    where ht.query_id=r."queryId" and ht.kind='keyword'
                        and pr.is_merch_listing=true and pr.amazon_listing_status='active'
                    order by h.ord limit ${KEYWORD_SHELF_SIZE}) s
            ) sh on true`
            : sql`left join lateral (select null::int median_bsr,0 fresh,0 elite) sh on true`;
    const facet = input.facet
        ? sql`left join lateral (${dominantFacetQuery(sql`r."queryId"`)}) f on true`
        : sql`left join lateral (select null::text facet) f on true`;
    return sql`${shelf} ${facet}`;
};

/** The facet value most of a keyword's retained Products carry; ties break by facet, name. */
export const dominantFacetQuery = (queryId: SQL) => sql`
    select pfv.facet,pfv.name from keyword_products kp
    join product_facets pf on pf.product_id=kp.product_id
    join product_facet_values pfv on pfv.id=pf.facet_value_id
    where kp.query_id=${queryId}
    group by pfv.id,pfv.facet,pfv.name
    order by count(*) desc,pfv.facet,pfv.name limit 1`;

/** Ascending jsonb keys; every sort ends with creation time and identity for stable paging. */
export const directorySortKey = (sort: Sort) => {
    const tail = sql`-extract(epoch from "createdAt")*1000000,id`;
    const score = sql`coalesce(-score::double precision,1)`;
    const median = sql`coalesce(median_bsr,1000000000000)`;
    switch (sort) {
        case 'work':
            // Graduated keywords first (syncing, then needing sync by due time, then live by next
            // check), then trials in Brand Analytics rank order, then dropped and untracked.
            return sql`jsonb_build_array(
                case stage when 'graduated' then 0 when 'trial' then 1 when 'dropped' then 2 else 3 end,
                case freshness when 'syncing' then 0 when 'needsSync' then 1 when 'live' then 2 else 3 end,
                case when stage='trial' then coalesce("searchFrequencyRank",2147483647)
                    when freshness='needsSync' then extract(epoch from coalesce("nextCheckAt","createdAt"))*1000000
                    when freshness='live' then coalesce(extract(epoch from "nextCheckAt")*1000000,0)
                    when freshness is null then -extract(epoch from "createdAt")*1000000 else 0 end,
                0,0,"queueCreated","queueIdentity")`;
        case 'newest':
            return sql`jsonb_build_array(0,0,0,0,0,${tail})`;
        case 'score':
            return sql`jsonb_build_array(${score},0,0,0,0,${tail})`;
        case 'medianBsr':
            return sql`jsonb_build_array(${median},0,0,0,0,${tail})`;
        case 'fresh':
            return sql`jsonb_build_array(-fresh,${median},0,0,0,${tail})`;
        case 'merch':
            return sql`jsonb_build_array(-merch,${score},0,0,0,${tail})`;
        default: {
            const exhaustive: never = sort;
            throw new Error(`Unknown keyword directory sort ${exhaustive}`);
        }
    }
};
