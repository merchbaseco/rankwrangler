import { sql } from 'drizzle-orm';
import { db } from './index';

/**
 * Deletes up to `batchSize` events that occurred before `before`, found through the
 * `(account_id, occurred_at)` index. Nothing reads events older than the Status range (seven
 * days) and the retention keeps thirty.
 */
export const deleteExpiredEventLogs = async (input: { before: Date; batchSize: number }) =>
    (
        await db.execute(sql`
            delete from event_logs where id in (
                select id from event_logs where occurred_at<${input.before.toISOString()}::timestamp
                limit ${input.batchSize})
            returning 1`)
    ).length;

/** Deletes the folded counts before `before`: a few thousand small rows a day. */
export const deleteExpiredEventLogCounts = async (input: { before: Date }) =>
    (
        await db.execute(sql`
            delete from event_log_counts
            where bucket_start<${input.before.toISOString()}::timestamp
            returning 1`)
    ).length;
