import { sql } from 'drizzle-orm';
import type { db } from './index';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// How long a claimed pass stays leased to its job before another job may take it over.
export const keywordScanLeaseMs = 300_000;

// Rewrites `scan_due_at`/`scan_depth` on the given discovery targets from their latest pass and
// `next_check_at`, so the scheduler lists due scans from an index instead of walking every pass.
// It is the claim's readiness rule (claimKeywordExploration) as one instant: a target with no pass
// is due from its creation; a continuing pass at its resume time; a finished one at its resume time
// or the target's next check, whichever is first; a claimed one no earlier than its lease expiry.
// Every write to a target's latest pass, `next_check_at` or `enabled` calls this in the same
// transaction. A value left too early costs one job, whose refused claim calls this and corrects
// it; the column defaults to now(), so a target inserted without it is due, never stranded.
export const syncKeywordScanDue = async (tx: Transaction, targetIds: readonly string[]) => {
    if (!targetIds.length) return;
    await tx.execute(sql`
        update discovery_targets t set scan_due_at=d.due_at,scan_depth=d.depth
        from (
            select s.id,coalesce(greatest(
                    case when p.stop_reason in ${continuing} then p.resume_at
                        else least(p.resume_at,s.next_check_at) end,
                    p.claim_at+${lease}),s.created_at) due_at,
                coalesce(p.stop_reason in ${continuing} and p.next_page>0,false) depth
            from discovery_targets s left join lateral (
                select stop_reason,resume_at,claim_at,next_page from keyword_exploration_passes
                where target_id=s.id order by created_at desc,id desc limit 1
            ) p on true
            where s.id=any(${`{${[...new Set(targetIds)].join(',')}}`}::uuid[])
        ) d
        where t.id=d.id and (t.scan_due_at,t.scan_depth) is distinct from (d.due_at,d.depth)`);
};

const continuing = sql.raw(`('running','budget','jobCap')`);
const lease = sql.raw(`interval '${keywordScanLeaseMs} milliseconds'`);
