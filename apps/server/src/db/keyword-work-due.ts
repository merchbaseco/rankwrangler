import { sql } from 'drizzle-orm';
import { db } from './index';

// Read-only lists of keyword-pipeline entities whose next step is due. The scheduler enqueues them;
// each job then re-checks and claims its entity, so a stale list never duplicates durable work.
const lease = sql`interval '5 minutes'`;

// Mirrors the claim's readiness rule in claimKeywordExploration. Depth means a continuing pass
// already past its first page; everything else due is a head check.
export const listDueKeywordScans = async (now: Date, limit: number) =>
    db.execute<{ id: string; depth: boolean }>(sql`
        select t.id, coalesce(latest.stop_reason in ('running','budget','jobCap') and latest.next_page>0,false) depth
        from discovery_targets t left join lateral (
            select resume_at,claim_at,stop_reason,next_page from keyword_exploration_passes
            where target_id=t.id order by created_at desc,id desc limit 1
        ) latest on true
        where t.enabled and (latest.resume_at is null or (
            (case when latest.stop_reason in ('running','budget','jobCap') then latest.resume_at
                else least(latest.resume_at,coalesce(t.next_check_at,latest.resume_at)) end)<=${now.toISOString()}::timestamp
            and (latest.claim_at is null or latest.claim_at<=${now.toISOString()}::timestamp-${lease})))
        order by depth, coalesce(t.next_check_at,t.created_at), t.id
        limit ${limit}`);

// Same product conditions as the claim: a product that stopped being active Merch is not listed,
// so it cannot hold a queue slot it would never use.
export const listDueProductMining = async (
    now: Date,
    stage: 'pending' | 'recommendationsSaved',
    limit: number
) =>
    db.execute<{ id: string }>(sql`
        select m.product_id id from product_keyword_mining m join products p on p.id=m.product_id
        where m.stage=${stage} and m.next_due_at<=${now.toISOString()}::timestamp
            and (m.claim_at is null or m.claim_at<=${now.toISOString()}::timestamp-${lease})
            and p.marketplace_id='ATVPDKIKX0DER' and p.is_merch_listing and p.amazon_listing_status='active'
            and not exists(select 1 from official_brands b where b.marketplace_id=p.marketplace_id
                and b.normalized_brand=lower(btrim(regexp_replace(p.brand,'[[:space:]]+',' ','g'))))
        order by m.next_due_at, m.product_id limit ${limit}`);

// Same eligibility as claimProductKeywordMining's first claim: strongest rank first, never excluded.
export const listUnminedProducts = async (limit: number) =>
    db.execute<{ id: string }>(sql`
        select p.id from products p
        where p.marketplace_id='ATVPDKIKX0DER' and p.is_merch_listing and p.amazon_listing_status='active'
            and length(btrim(coalesce(p.title,'')))>0
            and not exists(select 1 from product_keyword_mining m where m.product_id=p.id)
            and not exists(select 1 from official_brands b where b.marketplace_id=p.marketplace_id
                and b.normalized_brand=lower(btrim(regexp_replace(p.brand,'[[:space:]]+',' ','g'))))
        order by p.root_category_bsr asc nulls last, p.created_at, p.id limit ${limit}`);

export const listDueAutocomplete = async (
    now: Date,
    stage: 'pending' | 'suggestionsSaved',
    limit: number
) =>
    db.execute<{ id: string }>(sql`
        select q.id from catalog_queries q
        join discovery_targets t on t.query_id=q.id
        left join keyword_autocomplete a on a.query_id=q.id
        where q.marketplace_id='ATVPDKIKX0DER' and t.kind='keyword' and t.enabled and t.tracking='tracked'
            and ${stage === 'pending' ? sql`(a.query_id is null or a.stage='pending')` : sql`a.stage='suggestionsSaved'`}
            and (a.query_id is null or (a.next_due_at<=${now.toISOString()}::timestamp
                and (a.claim_at is null or a.claim_at<=${now.toISOString()}::timestamp-${lease})))
        order by a.next_due_at asc nulls last, t.popularity_score desc nulls last, q.id
        limit ${limit}`);
