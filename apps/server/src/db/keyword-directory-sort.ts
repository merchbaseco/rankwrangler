import { type SQL, sql } from 'drizzle-orm';
import type { AppKeywordDirectoryInput } from '@/api/keyword-directory-input';

export const KEYWORD_SHELF_SIZE = 10;
export const KEYWORD_FRESH_DAYS = 60;

type Sort = AppKeywordDirectoryInput['sort'];

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
                case when stage='trial' then coalesce("trialRank",2147483647)
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
