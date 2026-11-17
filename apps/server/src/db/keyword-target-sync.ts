import { type SQL, sql } from 'drizzle-orm';
import { bsrTierMax } from '@/services/bsr-tiers';
import type { db } from './index';
import { KEYWORD_SHELF_SIZE } from './keyword-directory-sort';

type Transaction = Pick<Parameters<Parameters<typeof db.transaction>[0]>[0], 'execute'>;

// How long a claimed pass stays leased to its job before another job may take it over.
export const keywordScanLeaseMs = 300_000;

/**
 * The keyword measures a sync also rereads: `shelf` the head Products' shelf, `all` the shelf and
 * the retained Product and Merch counts (one Product lookup per retained Product).
 */
export type KeywordMeasures = 'shelf' | 'all';

/**
 * Rewrites what is derived from the given discovery targets and their latest pass, in one
 * statement: the scheduler's `scan_due_at`/`scan_depth`, and each keyword target's
 * `keyword_directory` row (with `measures`, its shelf or every measure too).
 *
 * `scan_due_at` is the claim's readiness rule (claimKeywordExploration) as one instant: a target
 * with no pass is due from its creation; a continuing pass at its resume time; a finished one at
 * its resume time or the target's next check, whichever is first; a claimed one no earlier than its
 * lease expiry. Every write to a target or its latest pass calls this in the same transaction, and
 * an accepted page passes `all`. A scan-due value left too early costs one job, whose refused claim
 * calls this and corrects it; the column defaults to now(), so a target inserted without it is
 * due, never stranded. Rows that would not change are not written.
 */
export const syncKeywordTargets = async (
    tx: Transaction,
    targetIds: readonly string[],
    measures?: KeywordMeasures
) => {
    if (!targetIds.length) return;
    const columns = [
        ...stateColumns,
        ...(measures ? shelfColumns : []),
        ...(measures === 'all' ? countColumns : []),
    ];
    const names = sql.join(
        columns.map(([name]) => sql.identifier(name)),
        sql`,`
    );
    await tx.execute(sql`
        with s as materialized (
            select t.id,t.query_id,t.kind,t.created_at,t.tracking,t.enabled,t.standing_tier,
                t.popularity_score,t.interval_days,t.next_check_at,t.head_observed_at,
                t.head_product_ids,p.stop_reason,p.resume_at,p.claim_at,p.next_page,
                p.failure_count,p.last_page_at
            from discovery_targets t left join lateral (
                select stop_reason,resume_at,claim_at,next_page,failure_count,last_page_at
                from keyword_exploration_passes
                where target_id=t.id order by created_at desc,id desc limit 1
            ) p on true
            where t.id=any(${`{${[...new Set(targetIds)].join(',')}}`}::uuid[])
        ), due as (
            update discovery_targets t set scan_due_at=d.due_at,scan_depth=d.depth
            from (
                select s.id,coalesce(greatest(
                        case when s.stop_reason in ${continuing} then s.resume_at
                            else least(s.resume_at,s.next_check_at) end,
                        s.claim_at+${lease}),s.created_at) due_at,
                    coalesce(s.stop_reason in ${continuing} and s.next_page>0,false) depth
                from s
            ) d
            where t.id=d.id and (t.scan_due_at,t.scan_depth) is distinct from (d.due_at,d.depth)
        )
        insert into keyword_directory as k (${names})
        select ${sql.join(
            columns.map(([, value]) => value),
            sql`,`
        )}
        from s join catalog_queries q on q.id=s.query_id
        ${measures === 'all' ? countLateral : sql``}
        ${measures ? shelfLateral : sql``}
        where s.kind='keyword'
        on conflict (query_id) do update set ${sql.join(
            columns.map(([name]) => sql`${sql.identifier(name)}=excluded.${sql.identifier(name)}`),
            sql`,`
        )}
        where (${sql.join(
            columns.map(([name]) => sql`k.${sql.identifier(name)}`),
            sql`,`
        )}) is distinct from (${sql.join(
            columns.map(([name]) => sql`excluded.${sql.identifier(name)}`),
            sql`,`
        )})`);
};

const continuing = sql.raw(`('running','budget','jobCap')`);
const lease = sql.raw(`interval '${keywordScanLeaseMs} milliseconds'`);

const stateColumns: readonly (readonly [string, SQL])[] = [
    ['query_id', sql`s.query_id`],
    ['target_id', sql`s.id`],
    ['marketplace_id', sql`q.marketplace_id`],
    ['term', sql`q.normalized_term`],
    ['created_at', sql`q.created_at`],
    ['target_created_at', sql`s.created_at`],
    ['tracking', sql`s.tracking`],
    ['enabled', sql`s.enabled`],
    ['standing_tier', sql`s.standing_tier`],
    ['popularity_score', sql`s.popularity_score`],
    ['interval_days', sql`s.interval_days`],
    ['next_check_at', sql`s.next_check_at`],
    ['head_observed_at', sql`s.head_observed_at`],
    ['pass_claimed_at', sql`s.claim_at`],
    ['pass_failures', sql`coalesce(s.failure_count,0)`],
    ['pass_continuing', sql`coalesce(s.stop_reason in ${continuing},false)`],
    ['pass_resume_at', sql`s.resume_at`],
    ['pass_last_page_at', sql`s.last_page_at`],
];

const countColumns: readonly (readonly [string, SQL])[] = [
    ['product_count', sql`m.products`],
    ['merch_count', sql`m.merch`],
];

const shelfColumns: readonly (readonly [string, SQL])[] = [
    ['shelf_median_bsr', sql`sh.median_bsr`],
    ['shelf_elite_count', sql`sh.elite`],
    ['shelf_first_available', sql`sh.first_available`],
];

// Retained Products and the active Merch listings among them.
const countLateral = sql`left join lateral (
    select count(*)::int products,
        count(*) filter(where pr.is_merch_listing and pr.amazon_listing_status='active')::int merch
    from keyword_products kp join products pr on pr.id=kp.product_id
    where kp.query_id=s.query_id) m on true`;

// The shelf: the first ten active Merch head Products in page-one order.
const shelfLateral = sql`left join lateral (
    select round(percentile_cont(0.5) within group (order by h.bsr))::int median_bsr,
        count(*) filter(where h.bsr between 1 and ${sql.raw(String(bsrTierMax.elite))})::int elite,
        coalesce(array_agg(h.first_available order by h.ord)
            filter(where h.first_available is not null),'{}') first_available
    from (
        select e.ord,pr.root_category_bsr bsr,pr.date_first_available first_available
        from jsonb_array_elements_text(s.head_product_ids) with ordinality e(id,ord)
        join products pr on pr.id=e.id::uuid
        where pr.is_merch_listing and pr.amazon_listing_status='active'
        order by e.ord limit ${sql.raw(String(KEYWORD_SHELF_SIZE))}
    ) h) sh on true`;
