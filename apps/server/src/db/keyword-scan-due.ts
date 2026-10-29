import { sql } from 'drizzle-orm';
import { db } from './index';

// Operator counts of enabled keyword targets waiting on a first-page scan: those never scanned
// (mostly new trials), and observed keywords whose recurring check is due, with the oldest due time.
export const readKeywordScanDue = async (now = new Date()) => {
    const at = sql`${now.toISOString()}::timestamp`;
    const [row] = await db.execute<{
        unscanned: number;
        checks: number;
        oldest_check_at: Date | string | null;
    }>(sql`
        select count(*) filter (where head_observed_at is null)::int unscanned,
            count(*) filter (where head_observed_at is not null
                and coalesce(next_check_at,${at})<=${at})::int checks,
            min(coalesce(next_check_at,created_at)) filter (where head_observed_at is not null
                and coalesce(next_check_at,${at})<=${at}) oldest_check_at
        from discovery_targets where enabled`);
    return {
        awaitingFirstScan: row?.unscanned ?? 0,
        checksDue: row?.checks ?? 0,
        oldestCheckDueAt: row?.oldest_check_at ?? null,
    };
};
