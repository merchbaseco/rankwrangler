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

// Live counts straight from pg-boss's job table (default `pgboss` schema). Waiting jobs can start
// now; scheduled jobs have a later start time (a followup or provider wait).
export const readJobQueueCounts = async (names: readonly string[]) =>
    db.execute<{
        name: string;
        waiting: number;
        scheduled: number;
        running: number;
        oldest_waiting_at: Date | null;
    }>(sql`
        select n.name,
            count(j.id) filter (where j.state in ('created','retry') and j.start_after<=now())::int waiting,
            count(j.id) filter (where j.state in ('created','retry') and j.start_after>now())::int scheduled,
            count(j.id) filter (where j.state='active')::int running,
            min(j.start_after) filter (where j.state in ('created','retry') and j.start_after<=now()) oldest_waiting_at
        from unnest(array[${sql.join(
            names.map(name => sql`${name}`),
            sql`,`
        )}]::text[]) n(name)
        left join pgboss.job j on j.name=n.name and j.state in ('created','retry','active')
        group by n.name`);
