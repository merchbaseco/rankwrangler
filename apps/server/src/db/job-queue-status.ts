import { sql } from 'drizzle-orm';
import { db } from './index';

// Raises long-waiting jobs to a priority, so lower-priority work (deeper keyword pages) cannot
// starve behind a steady stream of higher-priority work.
export const promoteWaitingJobs = async (
    name: string,
    input: { from: number; to: number; waitingSince: Date }
) =>
    (
        await db.execute(sql`
            update pgboss.job set priority=${input.to}
            where name=${name} and state in ('created','retry') and priority=${input.from}
                and created_on<${input.waitingSince.toISOString()}::timestamptz
            returning id`)
    ).length;
