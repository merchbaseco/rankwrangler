import { sql } from 'drizzle-orm';
import { db } from './index';

// Both statements filter on `state < 'active'`, exactly the predicate of pg-boss's own partial index
// `job_common_i5 (name, start_after) where state < 'active'`, so they read the queued jobs of one
// queue and never the completed history that makes up most of the table. pg-boss's getQueueStats
// counts every row of the queue, completed included, which is a full scan.

/** Jobs of one queue waiting to run (created or retry, deferred included). */
export const countQueuedJobs = async (name: string) => {
    const [row] = await db.execute<{ queued: number }>(sql`
        select count(*)::int queued from pgboss.job where name=${name} and state < 'active'`);
    return row?.queued ?? 0;
};

// Raises long-waiting jobs to a priority, so lower-priority work (deeper keyword pages) cannot
// starve behind a steady stream of higher-priority work.
export const promoteWaitingJobs = async (
    name: string,
    input: { from: number; to: number; waitingSince: Date }
) =>
    (
        await db.execute(sql`
            update pgboss.job set priority=${input.to}
            where name=${name} and state < 'active' and priority=${input.from}
                and created_on<${input.waitingSince.toISOString()}::timestamptz
            returning id`)
    ).length;
