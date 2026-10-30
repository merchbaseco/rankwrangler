import { type SQL, sql } from 'drizzle-orm';
import type { AppKeywordDirectoryInput } from '@/api/keyword-directory-input';
import { directoryMeasures, directorySortKey } from './keyword-directory-sort';
import { keywordDirectoryWhereSql, keywordStageSql } from './keyword-directory-stage';

/**
 * The directory's row source as CTEs ending in `ordered`: every Catalog query keyword with its
 * stage and freshness, Brand Analytics rank, the measures the request needs and its sort key.
 * `search` and `terms` narrow the scan up front. The page read and the facet aggregate both
 * select from it, so a stage, freshness or filter means the same thing in both. The per-keyword
 * measures are the expensive part (one lateral per row), so callers name the rows that need them.
 * Display-only columns (discovery sources) are read for the returned page instead.
 */
export const directorySource = (input: {
    asOf: string;
    sort: AppKeywordDirectoryInput['sort'];
    search?: string;
    terms?: readonly string[];
    facet?: string;
    shelf?: boolean;
    /** Rows that get Product, Merch, shelf and facet measures; `null` skips them (see `directoryMeasures`). */
    measured: SQL | null;
}) => {
    const { asOf, sort, search, terms, facet, shelf, measured } = input;
    return sql`
        with directory as (
            select q.id,q.id "queryId",q.normalized_term term,q.created_at "createdAt",
                ${keywordStageSql} stage,coalesce(t.standing_tier,'unrated') heat,
                t.popularity_score score,ba.search_frequency_rank "searchFrequencyRank",
                case when a.stage='complete' then 'complete' when a.claim_at>${asOf}::timestamp-interval '5 minutes' then 'running'
                    when a.failure_count>0 then 'retrying' when t.tracking='tracked' and t.enabled then 'queued' else 'not eligible' end expansion,
                case when p.claim_at>${asOf}::timestamp-interval '5 minutes' then 'running'
                    when not coalesce(t.enabled,false) then 'paused' when p.failure_count>0 then 'retrying'
                    when p.stop_reason in ('running','budget','jobCap') and (t.head_observed_at is null
                        or t.next_check_at<=${asOf}::timestamp) then 'waiting'
                    when t.next_check_at<=${asOf}::timestamp or t.head_observed_at is null then 'queued' else 'scheduled' end discovery,
                coalesce(p.last_page_at,t.head_observed_at) "lastCheckedAt",case when p.stop_reason in ('running','budget','jobCap') then p.resume_at else least(t.next_check_at,p.resume_at) end "nextCheckAt",t.interval_days "intervalDays",
                extract(epoch from coalesce(t.created_at,q.created_at))*1000000 "queueCreated",coalesce(t.id,q.id) "queueIdentity"
            from catalog_queries q
            left join discovery_targets t on t.query_id=q.id and t.kind='keyword'
            left join keyword_autocomplete a on a.query_id=q.id
            left join brand_analytics_search_terms ba on ba.marketplace_id=q.marketplace_id and ba.normalized_term=q.normalized_term
            left join lateral (select claim_at,stop_reason,resume_at,last_page_at,failure_count from keyword_exploration_passes where target_id=t.id order by created_at desc,id desc limit 1) p on true
            where ${keywordDirectoryWhereSql({ search, heat: 'all' }, terms)}
        ), classified as (
            select *,case when stage in ('dropped','untracked') then null
                    when expansion='running' or discovery='running' then 'syncing'
                    when stage='trial' or discovery in ('queued','waiting','retrying') then 'needsSync'
                    else 'live' end freshness,
                (stage in ('graduated','trial') and (expansion='retrying' or discovery='retrying')) "retryScheduled"
            from directory
        ), measured as (
            select r.*,m.products,m.merch,sh.median_bsr,sh.fresh,sh.elite,f.facet from classified r
            ${directoryMeasures({ sort, facet, asOf, shelf, measured })}
        ), ordered as (
            select *,${directorySortKey(sort)} "sortKey"
            from measured
        )`;
};
