import { sql } from 'drizzle-orm';
import { db } from './index';

// Read-only lists of keyword-pipeline entities whose next step is due. The scheduler enqueues them;
// each job then re-checks and claims its entity, so a stale list never duplicates durable work.
const lease = sql`interval '5 minutes'`;

// Due keyword scans, read from the `scan_due_at` index (see syncKeywordScanDue) so the listing
// touches only the rows it returns. Heads come first, then depth (a continuing pass already past
// its first page) fills the rest. Oldest due first; targets due at the same instant, like trials
// registered together, are listed most searched first (Brand Analytics rank).
export const listDueKeywordScans = async (now: Date, limit: number) => {
    const heads = await listDue(now, false, limit);
    const depth = heads.length < limit ? await listDue(now, true, limit - heads.length) : [];
    return [...heads, ...depth];
};

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
