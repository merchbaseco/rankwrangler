import { sql } from 'drizzle-orm';
import { db } from './index';

// Read-only lists of keyword-pipeline entities whose next step is due. The scheduler enqueues them;
// each job then re-checks and claims its entity, so a stale list never duplicates durable work.
const lease = sql`interval '5 minutes'`;

// Mirrors the claim's readiness rule in claimKeywordExploration. Depth means a continuing pass
// already past its first page; everything else due is a head check. Trials registered together
// are listed most searched first (Brand Analytics rank).
export const listDueKeywordScans = async (now: Date, limit: number) =>
    db.execute<{ id: string; depth: boolean; tracked: boolean }>(sql`
        select t.id, coalesce(latest.stop_reason in ('running','budget','jobCap') and latest.next_page>0,false) depth,
            t.tracking='tracked' tracked
        from discovery_targets t join catalog_queries q on q.id=t.query_id
        left join brand_analytics_search_terms ba on ba.marketplace_id=q.marketplace_id
            and ba.normalized_term=q.normalized_term
        left join lateral (
            select resume_at,claim_at,stop_reason,next_page from keyword_exploration_passes
            where target_id=t.id order by created_at desc,id desc limit 1
        ) latest on true
        where t.enabled and (latest.resume_at is null or (
            (case when latest.stop_reason in ('running','budget','jobCap') then latest.resume_at
                else least(latest.resume_at,coalesce(t.next_check_at,latest.resume_at)) end)<=${now.toISOString()}::timestamp
            and (latest.claim_at is null or latest.claim_at<=${now.toISOString()}::timestamp-${lease})))
        order by depth, coalesce(t.next_check_at,t.created_at), ba.search_frequency_rank nulls last, t.id
        limit ${limit}`);

// Tracked seeds whose one-time autocomplete expansion has not completed.
export const listDueAutocomplete = async (now: Date, limit: number) =>
    db.execute<{ id: string }>(sql`
        select q.id from catalog_queries q
        join discovery_targets t on t.query_id=q.id
        left join keyword_autocomplete a on a.query_id=q.id
        where q.marketplace_id='ATVPDKIKX0DER' and t.kind='keyword' and t.enabled and t.tracking='tracked'
            and (a.query_id is null or a.stage<>'complete')
            and (a.query_id is null or (a.next_due_at<=${now.toISOString()}::timestamp
                and (a.claim_at is null or a.claim_at<=${now.toISOString()}::timestamp-${lease})))
        order by a.next_due_at asc nulls last, t.popularity_score desc nulls last, q.id
        limit ${limit}`);

// Keyword themes whose one-time autocomplete expansion has not completed.
export const listDueThemeAutocomplete = async (now: Date, limit: number) =>
    db.execute<{ id: string }>(sql`
        select id from keyword_themes
        where marketplace_id='ATVPDKIKX0DER' and stage<>'complete'
            and next_due_at<=${now.toISOString()}::timestamp
            and (claim_at is null or claim_at<=${now.toISOString()}::timestamp-${lease})
        order by next_due_at, created_at, id
        limit ${limit}`);
