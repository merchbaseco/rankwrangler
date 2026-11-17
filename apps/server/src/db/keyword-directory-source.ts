import { type SQL, sql } from 'drizzle-orm';
import type { AppKeywordDirectoryInput } from '@/api/keyword-directory-input';
import { KEYWORD_FRESH_DAYS } from './keyword-directory-sort';
import {
    keywordDirectoryWhereSql,
    keywordStageSql,
    keywordStageTargetSql,
} from './keyword-directory-stage';

/**
 * The directory's row source as CTEs ending in `classified`: every keyword with its stage and
 * freshness and the measures sorts and filters read, all from the narrow `keyword_directory`
 * projection (see `syncKeywordTargets`) plus the small autocomplete table, so a read is one scan
 * of a table that stays in memory with no per-keyword lookups. `search`, `terms` and `stage`
 * narrow the scan up front. The page read and the facet aggregate both select from it, so a
 * stage, freshness or filter means the same thing in both. Columns only some reads need are
 * computed only for them: the fresh count for its sort, a trial's Brand Analytics rank (one index
 * probe per trial) for the work sort, and the dominant facet, joined from the few faceted Products
 * outward, for a facet filter. Display-only columns are read for the returned page instead.
 */
export const directorySource = (input: {
    asOf: string;
    sort?: AppKeywordDirectoryInput['sort'];
    search?: string;
    terms?: readonly string[];
    facet?: string;
    /** The page's stage filter, applied to the projection's columns; omit to scan all. */
    stage?: string | readonly string[];
}) => {
    const { asOf, sort, search, terms, facet, stage } = input;
    const trial = sql`d.enabled and d.tracking='trial'`;
    return sql`
        with directory as (
            select d.query_id id,d.query_id "queryId",d.term,d.created_at "createdAt",
                ${keywordStageSql} stage,d.standing_tier heat,d.popularity_score score,
                case when a.stage='complete' then 'complete' when a.claim_at>${asOf}::timestamp-interval '5 minutes' then 'running'
                    when a.failure_count>0 then 'retrying' when d.tracking='tracked' and d.enabled then 'queued' else 'not eligible' end expansion,
                case when d.pass_claimed_at>${asOf}::timestamp-interval '5 minutes' then 'running'
                    when not d.enabled then 'paused' when d.pass_failures>0 then 'retrying'
                    when d.pass_continuing and (d.head_observed_at is null
                        or d.next_check_at<=${asOf}::timestamp) then 'waiting'
                    when d.next_check_at<=${asOf}::timestamp or d.head_observed_at is null then 'queued' else 'scheduled' end discovery,
                coalesce(d.pass_last_page_at,d.head_observed_at) "lastCheckedAt",
                case when d.pass_continuing then d.pass_resume_at else least(d.next_check_at,d.pass_resume_at) end "nextCheckAt",
                d.interval_days "intervalDays",extract(epoch from d.target_created_at)*1000000 "queueCreated",d.target_id "queueIdentity",
                d.product_count products,d.merch_count merch,d.shelf_median_bsr median_bsr,d.shelf_elite_count elite,
                ${sort === 'fresh' ? freshCount(asOf) : sql`0`} fresh,
                ${sort === 'work' ? sql`case when ${trial} then ${searchFrequencyRank(sql`d`)} end` : sql`null::int`} "trialRank",
                ${facet ? sql`f.facet` : sql`null::text`} facet
            from keyword_directory d
            left join keyword_autocomplete a on a.query_id=d.query_id
            ${facet ? sql`left join (${dominantFacets}) f on f.query_id=d.query_id` : sql``}
            where ${keywordDirectoryWhereSql({ search, heat: 'all' }, terms)}
                and ${stage === undefined ? sql`true` : keywordStageTargetSql(stage)}
        ), classified as (
            select *,case when stage in ('dropped','untracked') then null
                    when expansion='running' or discovery='running' then 'syncing'
                    when stage='trial' or discovery in ('queued','waiting','retrying') then 'needsSync'
                    else 'live' end freshness,
                (stage in ('graduated','trial') and (expansion='retrying' or discovery='retrying')) "retryScheduled"
            from directory
        )`;
};

/** A keyword's Brand Analytics rank over a row alias with `marketplace_id` and `term`. */
export const searchFrequencyRank = (row: SQL) => sql`(select ba.search_frequency_rank
    from brand_analytics_search_terms ba
    where ba.marketplace_id=${row}.marketplace_id and ba.normalized_term=${row}.term)`;

// Shelf Products first available within the fresh window.
const freshCount = (
    asOf: string
) => sql`(select count(*)::int from unnest(d.shelf_first_available) fa
    where fa>=${asOf}::timestamp-${KEYWORD_FRESH_DAYS}*interval '1 day')`;

// Every keyword's dominant facet, from the faceted Products outward (`dominantFacetQuery` per
// keyword): the value most of its retained Products carry, ties by facet then name.
const dominantFacets = sql`select distinct on (kp.query_id) kp.query_id,pfv.facet
    from product_facets pf
    join keyword_products kp on kp.product_id=pf.product_id
    join product_facet_values pfv on pfv.id=pf.facet_value_id
    group by kp.query_id,pfv.id,pfv.facet,pfv.name
    order by kp.query_id,count(*) desc,pfv.facet,pfv.name`;
