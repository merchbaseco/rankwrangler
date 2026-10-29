import { sql } from 'drizzle-orm';
import { db } from './index';

// Execution logs cascade with their run.
export const deleteExpiredJobExecutions = async (input: { before: Date; batchSize: number }) =>
    (
        await db.execute(sql`
            delete from job_executions where id in (
                select id from job_executions where started_at<${input.before.toISOString()}::timestamp
                limit ${input.batchSize})
            returning id`)
    ).length;
