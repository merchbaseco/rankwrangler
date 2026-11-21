import { sql } from 'drizzle-orm';
import { db } from './index';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Read-only lists of keyword-pipeline entities whose next step is due. The scheduler enqueues them;
// each job then re-checks and claims its entity, so a stale list never duplicates durable work.
const lease = sql`interval '5 minutes'`;

// Due keyword scans, read from the `scan_due_at` index (see syncKeywordTargets) so the listing
// touches only the rows it returns. Heads come first, then depth (a continuing pass already past
// its first page) fills the rest. Oldest due first; targets due at the same instant, like trials
// registered together, are listed most searched first (Brand Analytics rank).
export const listDueKeywordScans = async (now: Date, limit: number) => {
    const heads = await listDue(now, false, limit);
    const depth = heads.length < limit ? await listDue(now, true, limit - heads.length) : [];
    return [...heads, ...depth];
};

// Tracked keyword heads due for recheck, read from `discovery_targets_tracked_scan_due_idx` so a
// weekly Brand Analytics trial burst cannot bury due tracked checks behind older trial timestamps.
export const listDueTrackedHeadScans = (now: Date, limit: number) =>
    db.execute<{ id: string; depth: boolean; tracked: boolean }>(sql`
        select t.id,false depth,true tracked from discovery_targets t
        where t.enabled and t.tracking='tracked' and not t.scan_depth
            and t.scan_due_at<=${now.toISOString()}::timestamp
        order by t.scan_due_at,t.id
        limit ${limit}`);

// Tracked seeds whose one-time autocomplete expansion has not completed. Seeds with a pending
// expansion come first (a retry or deferral, oldest due first, unclaimed), from the
// `keyword_autocomplete_due_idx`; seeds never attempted fill the rest, most popular first, from
// `discovery_targets_autocomplete_due_idx`. Either read touches only the rows it returns.
export const listDueAutocomplete = async (
    now: Date,
    limit: number,
    executor: Pick<Transaction, 'execute'> = db
) => {
    const pending = await listPendingAutocomplete(executor, now, limit);
    const fresh =
        pending.length < limit
            ? await listUnattemptedAutocomplete(executor, limit - pending.length)
            : [];
    return [...pending, ...fresh];
};

// Keyword prefixes whose one-time autocomplete expansion has not completed.
export const listDuePrefixAutocomplete = async (now: Date, limit: number) =>
    db.execute<{ id: string }>(sql`
        select id from keyword_prefixes
        where marketplace_id='ATVPDKIKX0DER' and stage<>'complete'
            and next_due_at<=${now.toISOString()}::timestamp
            and (claim_at is null or claim_at<=${now.toISOString()}::timestamp-${lease})
        order by next_due_at, created_at, id
        limit ${limit}`);

const listDue = (now: Date, depth: boolean, limit: number) =>
    db.execute<{ id: string; depth: boolean; tracked: boolean }>(sql`
        select t.id,t.scan_depth depth,t.tracking='tracked' tracked from discovery_targets t
        where t.enabled and t.scan_depth=${depth} and t.scan_due_at<=${now.toISOString()}::timestamp
        order by t.scan_due_at,(
            select ba.search_frequency_rank from catalog_queries q
            join brand_analytics_search_terms ba on ba.marketplace_id=q.marketplace_id
                and ba.normalized_term=q.normalized_term
            where q.id=t.query_id
        ) nulls last,t.id
        limit ${limit}`);

const listPendingAutocomplete = (
    executor: Pick<Transaction, 'execute'>,
    now: Date,
    limit: number
) =>
    executor.execute<{ id: string }>(sql`
        select a.query_id id from keyword_autocomplete a
        join discovery_targets t on t.query_id=a.query_id and t.kind='keyword'
        where a.stage<>'complete' and a.next_due_at<=${now.toISOString()}::timestamp
            and (a.claim_at is null or a.claim_at<=${now.toISOString()}::timestamp-${lease})
            and t.enabled and t.tracking='tracked'
        order by a.next_due_at, t.popularity_score desc nulls last, a.query_id
        limit ${limit}`);

const listUnattemptedAutocomplete = (executor: Pick<Transaction, 'execute'>, limit: number) =>
    executor.execute<{ id: string }>(sql`
        select t.query_id id from discovery_targets t
        where t.kind='keyword' and t.enabled and t.tracking='tracked' and not t.autocompleted
            and not exists (select 1 from keyword_autocomplete a where a.query_id=t.query_id)
        order by t.popularity_score desc nulls last, t.query_id
        limit ${limit}`);
