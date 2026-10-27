import { keywordDirectoryInput, keywordDirectoryCursor } from '@/api/keyword-directory-input';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './index';

type DirectoryRow = {
    sortKey: z.infer<typeof keywordDirectoryCursor>['key'];
    id: string;
    queryId: string | null;
    term: string;
    createdAt: string;
    status: 'queued' | 'scanning' | 'upToDate' | 'untracked';
    untrackedReason: 'notRelevant' | 'noMerchFound' | 'notScheduled' | null;
    retryScheduled: boolean;
    heat: string;
    score: number | null;
    sources: string[];
    products: number;
    merch: number;
    lastCheckedAt: string | null;
    nextCheckAt: string | null;
    intervalDays: number | null;
};
export const readKeywordDirectory = async (
    input: z.infer<typeof keywordDirectoryInput>,
    exactTerm?: string,
    options?: {
        terms?: readonly string[];
        view?: Pick<z.infer<typeof keywordDirectoryCursor>, 'asOf' | 'trialTurn' | 'sort'>;
    }
) => {
    const asOf = options?.view?.asOf ?? input.cursor?.asOf ?? new Date().toISOString();
    const sort = options?.view?.sort ?? input.cursor?.sort ?? input.sort;
    const [capacity] = input.cursor
        ? []
        : await db.execute<{ trial_turn: boolean }>(
              sql`select (discovery_claims%5=0) trial_turn from spapi_catalog_capacity where id=1`
          );
    const trialTurn =
        options?.view?.trialTurn ?? input.cursor?.trialTurn ?? capacity?.trial_turn ?? true;
    const rows = await db.execute<DirectoryRow>(sql`
        with directory as (
            select q.id,q.id "queryId",q.normalized_term term,q.created_at "createdAt",
                coalesce(t.tracking,'untracked') qualification,coalesce(t.standing_tier,'unrated') heat,
                t.popularity_score score,coalesce(s.sources,'{}'::text[]) sources,
                case when a.stage='complete' then 'complete' when a.claim_at>${asOf}::timestamp-interval '5 minutes' then 'running'
                    when a.failure_count>0 then 'retrying' when a.stage='suggestionsSaved' then 'judging' when t.tracking='tracked' and t.enabled then 'queued' else 'not eligible' end expansion,
                case when p.claim_at>${asOf}::timestamp-interval '5 minutes' then 'running'
                    when not coalesce(t.enabled,false) then 'paused' when p.failure_count>0 then 'retrying'
                    when p.stop_reason in ('running','budget','jobCap') and (t.head_observed_at is null
                        or t.next_check_at<=${asOf}::timestamp) then 'waiting'
                    when t.next_check_at<=${asOf}::timestamp or t.head_observed_at is null then 'queued' else 'scheduled' end discovery,
                coalesce(m.products,0)::int products,coalesce(m.merch,0)::int merch,
                coalesce(p.last_page_at,t.head_observed_at) "lastCheckedAt",case when p.stop_reason in ('running','budget','jobCap') then p.resume_at else least(t.next_check_at,p.resume_at) end "nextCheckAt",t.interval_days "intervalDays",
                case when t.enabled and t.tracking<>'dormant' then null
                    when c.verdict='rejected' then 'notRelevant'
                    when t.tracking='dormant' and t.trial_failures>=2 then 'noMerchFound'
                    else 'notScheduled' end "untrackedReason",
                case when t.tracking='tracked' and t.enabled and coalesce(a.stage,'pending')<>'complete' then coalesce(a.next_due_at,q.created_at) end "autocompleteDueAt",
                case when t.tracking=${trialTurn ? 'trial' : 'tracked'} then 0 else 1 end "scanClass",
                case when t.head_observed_at is null then 1 else greatest(0,extract(epoch from(${asOf}::timestamp-coalesce(t.next_check_at,${asOf}::timestamp))))/greatest(t.interval_days*86400,1) end::double precision urgency,
                coalesce(extract(epoch from t.last_selected_at)*1000000,0)::bigint selected,
                extract(epoch from coalesce(t.created_at,q.created_at))*1000000 "queueCreated",coalesce(t.id,q.id) "queueIdentity"
            from catalog_queries q
            left join discovery_targets t on t.query_id=q.id and t.kind='keyword'
            left join keyword_autocomplete a on a.query_id=q.id
            left join mined_keyword_candidates c on c.marketplace_id=q.marketplace_id and c.term=q.normalized_term
            left join lateral (select array_agg(distinct e.kind) sources from discovery_evidence e where e.target_id=t.id and e.eligible) s on true
            left join lateral (select claim_at,stop_reason,resume_at,last_page_at,failure_count from keyword_exploration_passes where target_id=t.id order by created_at desc,id desc limit 1) p on true
            left join lateral (select count(*) products,count(*) filter(where pr.is_merch_listing=true and pr.amazon_listing_status='active') merch
                from keyword_products kp join products pr on pr.id=kp.product_id where kp.query_id=q.id) m on true
            where q.marketplace_id='ATVPDKIKX0DER'
            union all
            select c.id,null::uuid,c.term,c.created_at,case when c.verdict is null then 'pending' else c.verdict end,'unrated',null::real,
                array_remove(array[case when exists(select 1 from product_keyword_candidates l where l.candidate_id=c.id) then 'adsRecommendation' end,
                    case when exists(select 1 from autocomplete_keyword_candidates l where l.candidate_id=c.id) then 'autocomplete' end],null),
                case when c.claim_at>${asOf}::timestamp-interval '5 minutes' then 'running' else 'not eligible' end,
                'not eligible',0,0,null::timestamp,null::timestamp,null::real,case when c.verdict='rejected' then 'notRelevant' end,null::timestamp,3,0::double precision,0::bigint,extract(epoch from c.created_at)*1000000,c.id
            from mined_keyword_candidates c where c.marketplace_id='ATVPDKIKX0DER'
                and not exists(select 1 from catalog_queries q where q.marketplace_id=c.marketplace_id and q.normalized_term=c.term)
        ), classified as (
            select *,case when "untrackedReason" is not null then 'untracked'
                when expansion='running' or discovery='running' then 'scanning'
                when qualification in ('pending','accepted') or discovery in ('queued','waiting','retrying') then 'queued'
                else 'upToDate' end status,
                (expansion='retrying' or discovery='retrying') "retryScheduled"
            from directory
        ), readiness as (
            select *,coalesce(least(case when discovery in ('queued','waiting','retrying') then coalesce("nextCheckAt","createdAt") else "nextCheckAt" end,"autocompleteDueAt"),"createdAt") eligible_at,
                case when status='scanning' then 0 when status='untracked' then 4 when status='upToDate' then 3
                    when coalesce(least(case when discovery in ('queued','waiting','retrying') then coalesce("nextCheckAt","createdAt") else "nextCheckAt" end,"autocompleteDueAt"),"createdAt")>${asOf}::timestamp then 2 else 1 end bucket
            from classified
        ), ordered as (
            select *,case when ${sort}='newest' then jsonb_build_array(0,0,0,0,0,-extract(epoch from "createdAt")*1000000,id)
                else jsonb_build_array(bucket,
                    case when bucket in (2,3) then extract(epoch from eligible_at)*1000000 else 0 end,
                    case when bucket=1 and discovery in ('queued','waiting','retrying') then "scanClass" when bucket=1 and qualification in ('pending','accepted') then 3 when bucket=1 then 2 else 0 end,
                    case when bucket=1 and discovery in ('queued','waiting','retrying') then -urgency when bucket=1 then -coalesce(score,0)::double precision else 0 end,
                    selected,"queueCreated","queueIdentity") end "sortKey"
            from readiness
        ) select id,"queryId",term,"createdAt",status,"untrackedReason","retryScheduled",heat,score,sources,products,merch,"lastCheckedAt","sortKey",
            case when status='untracked' then null else "nextCheckAt" end "nextCheckAt",
            case when status='untracked' then null else "intervalDays" end "intervalDays"
        from ordered where
            ${input.search ? sql`position(${input.search.toLowerCase()} in term)>0` : sql`true`}
            and ${
                options?.terms
                    ? sql`term in (${sql.join(
                          options.terms.map(term => sql`${term}`),
                          sql`,`
                      )})`
                    : exactTerm
                      ? sql`term=${exactTerm}`
                      : input.state === 'all'
                        ? sql`status<>'untracked'`
                        : sql`status=${input.state}`
            }
            and ${input.heat === 'all' ? sql`true` : sql`heat=${input.heat}`}
            and ${input.cursor ? sql`"sortKey">${JSON.stringify(input.cursor.key)}::jsonb` : sql`true`}
            order by "sortKey" asc limit ${input.limit + 1}`);
    const items = rows.slice(0, input.limit).map(row => ({
        ...row,
        createdAt: utcTimestamp(row.createdAt)!,
        lastCheckedAt: utcTimestamp(row.lastCheckedAt),
        nextCheckAt: utcTimestamp(row.nextCheckAt),
    }));
    const last = rows.slice(0, input.limit).at(-1);
    return {
        items,
        view: { asOf, trialTurn, sort },
        nextCursor:
            rows.length > input.limit && last ? { key: last.sortKey, asOf, trialTurn, sort } : null,
    };
};

const utcTimestamp = (value: string | null) =>
    value === null ? null : new Date(`${value.replace(' ', 'T')}Z`).toISOString();

export const listKeywordDirectory = async (
    input: z.infer<typeof keywordDirectoryInput>,
    exactTerm?: string
) => {
    const result = await readKeywordDirectory(input, exactTerm);
    return { items: result.items.map(({ sortKey, ...row }) => row), nextCursor: result.nextCursor };
};
