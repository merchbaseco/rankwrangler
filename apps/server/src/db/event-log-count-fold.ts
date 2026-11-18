import { eq, sql } from 'drizzle-orm';
import { eventLogCountState } from './event-log-count-schema';
import { db } from './index';

const MINUTE_MS = 60_000;
const HALF_HOUR_MS = 30 * MINUTE_MS;
/** Events are kept this long (prune-event-logs); the fold never counts further back. */
export const EVENT_LOG_RETENTION_MS = 30 * 24 * 60 * MINUTE_MS;
/**
 * Each fold recounts at least this far behind the newest whole minute, so an event whose
 * transaction commits a little after its `occurred_at` is still counted.
 */
export const EVENT_LOG_REFOLD_MS = 15 * MINUTE_MS;
/** One step counts at most a day of events; a backlog (the first run, an outage) takes steps. */
const FOLD_STEP_MS = 24 * 60 * MINUTE_MS;
/** Steps one run takes at most: enough for the whole retention window. */
const FOLD_MAX_STEPS = 32;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Brings `event_log_counts` up to the newest whole minute before `now`. Each step recounts one
 * window of raw events from the watermark (less the refold margin, floored to a half-hour so
 * half-hour rows are recounted whole), writes only the counts that changed, deletes counts whose
 * events are gone, and advances the watermark, all in one transaction. A first run starts at the
 * retention horizon and catches up a day per step.
 */
export const foldEventLogCounts = async (now = new Date()) => {
    let steps = 0;
    let foldedThrough: Date | null = null;
    while (steps < FOLD_MAX_STEPS) {
        const step = await db.transaction(tx => foldStep(tx, now));
        steps += 1;
        foldedThrough = step.foldedThrough;
        if (step.caughtUp) break;
    }
    return { steps, foldedThrough: foldedThrough?.toISOString() ?? null, didWork: steps > 1 };
};

const foldStep = async (tx: Transaction, now: Date) => {
    const [state] = await tx
        .select()
        .from(eventLogCountState)
        .where(eq(eventLogCountState.id, 1))
        .for('update');
    const target = floorTo(now.getTime(), MINUTE_MS);
    const from = state
        ? floorTo(
              Math.min(state.foldedThrough.getTime(), target - EVENT_LOG_REFOLD_MS),
              HALF_HOUR_MS
          )
        : floorTo(now.getTime() - EVENT_LOG_RETENTION_MS, HALF_HOUR_MS);
    const to = Math.min(target, from + FOLD_STEP_MS);
    if (to <= from) return { caughtUp: true, foldedThrough: state?.foldedThrough ?? null };
    const fromAt = sql`${new Date(from).toISOString()}::timestamp`;
    const toAt = sql`${new Date(to).toISOString()}::timestamp`;
    await tx.execute(sql`
        with fresh as (
            select account_id, width.minutes::smallint bucket_minutes,
                date_bin(width.span, occurred_at, timestamp '2000-01-01') bucket_start,
                primitive_type, level, status, count(*)::int count
            from event_logs
            cross join (values (1, interval '1 minute'), (30, interval '30 minutes'))
                width(minutes, span)
            where occurred_at >= ${fromAt} and occurred_at < ${toAt}
            group by 1, 2, 3, 4, 5, 6
        ),
        written as (
            insert into event_log_counts
                (account_id, bucket_minutes, bucket_start, primitive_type, level, status, count)
            select * from fresh
            on conflict on constraint event_log_counts_pk
            do update set count = excluded.count where event_log_counts.count <> excluded.count
        )
        delete from event_log_counts stale
        where stale.bucket_start >= ${fromAt} and stale.bucket_start < ${toAt}
            and not exists (
                select 1 from fresh
                where fresh.account_id = stale.account_id
                    and fresh.bucket_minutes = stale.bucket_minutes
                    and fresh.bucket_start = stale.bucket_start
                    and fresh.primitive_type = stale.primitive_type
                    and fresh.level = stale.level and fresh.status = stale.status
            )`);
    const foldedThrough = new Date(to);
    await tx
        .insert(eventLogCountState)
        .values({ id: 1, foldedThrough })
        .onConflictDoUpdate({ target: eventLogCountState.id, set: { foldedThrough } });
    return { caughtUp: to >= target, foldedThrough };
};

const floorTo = (ms: number, width: number) => Math.floor(ms / width) * width;
