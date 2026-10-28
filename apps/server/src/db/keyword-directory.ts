import type {
    keywordDirectoryInput,
    keywordDirectoryCursor,
    keywordFreshness,
    keywordStages,
} from '@/api/keyword-directory-input';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from './index';
import { keywordDirectoryWhereSql, keywordStageSql } from './keyword-directory-stage';

type DirectoryRow = {
    sortKey: z.infer<typeof keywordDirectoryCursor>['key'];
    id: string;
    queryId: string;
    term: string;
    createdAt: string;
    stage: (typeof keywordStages)[number];
    freshness: (typeof keywordFreshness)[number] | null;
    retryScheduled: boolean;
    heat: string;
    score: number | null;
    searchFrequencyRank: number | null;
    sources: string[];
    products: number;
    merch: number;
    lastCheckedAt: string | null;
    nextCheckAt: string | null;
    intervalDays: number | null;
};
type DirectoryView = Pick<z.infer<typeof keywordDirectoryCursor>, 'asOf' | 'sort'>;

// Default order: graduated keywords first (syncing, then needing sync by due time, then live by
// next check), then trials in Brand Analytics rank order, then dropped and untracked, newest first.
// Reading specific terms ignores stage and freshness filters so callers can re-evaluate a row.
export const readKeywordDirectory = async (
    input: z.infer<typeof keywordDirectoryInput>,
    options?: { terms?: readonly string[]; view?: DirectoryView }
) => {
    const asOf = options?.view?.asOf ?? input.cursor?.asOf ?? new Date().toISOString();
    const sort = options?.view?.sort ?? input.cursor?.sort ?? input.sort;
    const terms = options?.terms;
    const rows = await db.execute<DirectoryRow>(sql`
        with directory as (
            select q.id,q.id "queryId",q.normalized_term term,q.created_at "createdAt",
                ${keywordStageSql} stage,coalesce(t.standing_tier,'unrated') heat,
                t.popularity_score score,ba.search_frequency_rank "searchFrequencyRank",coalesce(s.sources,'{}'::text[]) sources,
                case when a.stage='complete' then 'complete' when a.claim_at>${asOf}::timestamp-interval '5 minutes' then 'running'
                    when a.failure_count>0 then 'retrying' when t.tracking='tracked' and t.enabled then 'queued' else 'not eligible' end expansion,
                case when p.claim_at>${asOf}::timestamp-interval '5 minutes' then 'running'
                    when not coalesce(t.enabled,false) then 'paused' when p.failure_count>0 then 'retrying'
                    when p.stop_reason in ('running','budget','jobCap') and (t.head_observed_at is null
                        or t.next_check_at<=${asOf}::timestamp) then 'waiting'
                    when t.next_check_at<=${asOf}::timestamp or t.head_observed_at is null then 'queued' else 'scheduled' end discovery,
                coalesce(m.products,0)::int products,coalesce(m.merch,0)::int merch,
                coalesce(p.last_page_at,t.head_observed_at) "lastCheckedAt",case when p.stop_reason in ('running','budget','jobCap') then p.resume_at else least(t.next_check_at,p.resume_at) end "nextCheckAt",t.interval_days "intervalDays",
                extract(epoch from coalesce(t.created_at,q.created_at))*1000000 "queueCreated",coalesce(t.id,q.id) "queueIdentity"
            from catalog_queries q
            left join discovery_targets t on t.query_id=q.id and t.kind='keyword'
            left join keyword_autocomplete a on a.query_id=q.id
            left join brand_analytics_search_terms ba on ba.marketplace_id=q.marketplace_id and ba.normalized_term=q.normalized_term
            left join lateral (select array_agg(distinct e.kind) sources from discovery_evidence e where e.target_id=t.id and e.eligible) s on true
            left join lateral (select claim_at,stop_reason,resume_at,last_page_at,failure_count from keyword_exploration_passes where target_id=t.id order by created_at desc,id desc limit 1) p on true
            left join lateral (select count(*) products,count(*) filter(where pr.is_merch_listing=true and pr.amazon_listing_status='active') merch
                from keyword_products kp join products pr on pr.id=kp.product_id where kp.query_id=q.id) m on true
            where ${keywordDirectoryWhereSql(input, terms)}
                and ${terms || input.stage === 'all' ? sql`true` : sql`${keywordStageSql}=${input.stage}`}
        ), classified as (
            select *,case when stage in ('dropped','untracked') then null
                    when expansion='running' or discovery='running' then 'syncing'
                    when stage='trial' or discovery in ('queued','waiting','retrying') then 'needsSync'
                    else 'live' end freshness,
                (stage in ('graduated','trial') and (expansion='retrying' or discovery='retrying')) "retryScheduled"
            from directory
        ), ordered as (
            select *,${sort === 'newest' ? newestKey : workKey} "sortKey" from classified
        ) select id,"queryId",term,"createdAt",stage,freshness,"retryScheduled",heat,score,"searchFrequencyRank",sources,products,merch,"lastCheckedAt","sortKey",
            case when freshness is null then null else "nextCheckAt" end "nextCheckAt",
            case when freshness is null then null else "intervalDays" end "intervalDays"
        from ordered where
            ${terms || input.freshness === 'all' ? sql`true` : sql`freshness=${input.freshness}`}
            and ${input.cursor ? sql`"sortKey">${JSON.stringify(input.cursor.key)}::jsonb` : sql`true`}
            order by "sortKey" asc limit ${terms ? terms.length : input.limit + 1}`);
    const limit = terms ? terms.length : input.limit;
    const items = rows.slice(0, limit).map(row => ({
        ...row,
        createdAt: utcTimestamp(row.createdAt)!,
        lastCheckedAt: utcTimestamp(row.lastCheckedAt),
        nextCheckAt: utcTimestamp(row.nextCheckAt),
    }));
    const last = items.at(-1);
    const view: DirectoryView = { asOf, sort };
    return {
        items,
        view,
        nextCursor: !terms && rows.length > limit && last ? { key: last.sortKey, ...view } : null,
    };
};

export const listKeywordDirectory = async (
    input: z.infer<typeof keywordDirectoryInput>,
    options?: { terms?: readonly string[] }
) => {
    const result = await readKeywordDirectory(input, options);
    return { items: result.items.map(({ sortKey, ...row }) => row), nextCursor: result.nextCursor };
};

const workKey = sql`jsonb_build_array(
    case stage when 'graduated' then 0 when 'trial' then 1 when 'dropped' then 2 else 3 end,
    case freshness when 'syncing' then 0 when 'needsSync' then 1 when 'live' then 2 else 3 end,
    case when stage='trial' then coalesce("searchFrequencyRank",2147483647)
        when freshness='needsSync' then extract(epoch from coalesce("nextCheckAt","createdAt"))*1000000
        when freshness='live' then coalesce(extract(epoch from "nextCheckAt")*1000000,0)
        when freshness is null then -extract(epoch from "createdAt")*1000000 else 0 end,
    0,0,"queueCreated","queueIdentity")`;
const newestKey = sql`jsonb_build_array(0,0,0,0,0,-extract(epoch from "createdAt")*1000000,id)`;

const utcTimestamp = (value: string | null) =>
    value === null ? null : new Date(`${value.replace(' ', 'T')}Z`).toISOString();
