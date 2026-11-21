import { isAutomaticSyncPaused } from './automatic-sync';
import { eq, sql } from 'drizzle-orm';
import { db } from './index';
import { keywordProviderCapacity as capacity } from './keyword-autocomplete-schema';

// Durable pacing and a daily ceiling for Amazon autocomplete calls, shared by every worker.
export class AutocompleteDeferred extends Error {
    constructor(readonly retryAt: Date) {
        super('Autocomplete capacity deferred');
    }
}

export const reserveAutocompleteCall = async (now = new Date()) =>
    db.transaction(async tx => {
        if (await isAutomaticSyncPaused(tx))
            throw new AutocompleteDeferred(new Date(now.getTime() + 60_000));
        const state = await lockProvider(tx, now);
        if (state.nextStartAt > now) throw new AutocompleteDeferred(state.nextStartAt);
        const day = utcDay(now);
        const dayStarts = state.day === day ? state.dayStarts : 0;
        if (dayStarts >= dailyLimit(state)) throw new AutocompleteDeferred(nextUtcDay(now));
        await tx
            .update(capacity)
            .set({
                nextStartAt: new Date(now.getTime() + jitteredSpacingMs(spacing(state))),
                starts: state.starts + 1,
                day,
                dayStarts: dayStarts + 1,
            })
            .where(eq(capacity.provider, provider));
    });

// A 429 or repeated 5xx doubles spacing (up to 15m) and backs off exponentially (1m to 30m).
// An isolated 5xx without Retry-After backs off briefly without doubling standing spacing so a
// single flaky residential proxy exit does not permanently throttle the queue.
export const computeThrottlePlan = ({
    currentSpacingMs,
    consecutiveThrottles,
    retryAfterMs: headerRetryAfterMs,
    statusCode,
}: {
    currentSpacingMs: number;
    consecutiveThrottles: number;
    retryAfterMs: number | null;
    statusCode?: number;
}) => {
    const throttles = consecutiveThrottles + 1;
    const isIsolated5xx =
        statusCode !== undefined &&
        statusCode >= 500 &&
        throttles === 1 &&
        headerRetryAfterMs === null;
    const backoffMs = isIsolated5xx ? 60_000 : Math.min(1_800_000, 60_000 * 2 ** (throttles - 1));
    const waitMs = Math.max(headerRetryAfterMs ?? 0, backoffMs);
    const nextSpacingMs = isIsolated5xx
        ? Math.max(baseSpacingMs, currentSpacingMs)
        : Math.min(900_000, Math.max(baseSpacingMs, currentSpacingMs) * 2);
    return { throttles, waitMs, nextSpacingMs };
};

export const throttleAutocomplete = async (
    headerRetryAfterMs: number | null,
    now = new Date(),
    statusCode?: number
) =>
    db.transaction(async tx => {
        const state = await lockProvider(tx, now);
        const plan = computeThrottlePlan({
            currentSpacingMs: spacing(state),
            consecutiveThrottles: state.consecutiveThrottles,
            retryAfterMs: headerRetryAfterMs,
            statusCode,
        });
        const retryAt = new Date(now.getTime() + plan.waitMs);
        await tx
            .update(capacity)
            .set({
                consecutiveThrottles: plan.throttles,
                spacingMs: plan.nextSpacingMs,
                nextStartAt: sql`greatest(${capacity.nextStartAt},${retryAt.toISOString()}::timestamp)`,
            })
            .where(eq(capacity.provider, provider));
        return retryAt;
    });

// A successful response clears the throttle streak and eases spacing 20% back toward its base.
export const relaxAutocomplete = async () => {
    await db
        .update(capacity)
        .set({
            consecutiveThrottles: 0,
            spacingMs: sql`greatest(${baseSpacingMs},round(coalesce(${capacity.spacingMs},${baseSpacingMs})*0.8))`,
        })
        .where(eq(capacity.provider, provider));
};

export const jitteredSpacingMs = (ms: number, random = Math.random()) =>
    Math.max(1_000, Math.round(ms * (0.8 + random * 0.4)));

export const deferAutocomplete = async (retryAt: Date) => {
    await db
        .insert(capacity)
        .values({ provider, nextStartAt: retryAt })
        .onConflictDoUpdate({
            target: capacity.provider,
            set: {
                nextStartAt: sql`greatest(keyword_mining_capacity.next_start_at,excluded.next_start_at)`,
            },
        });
};

export const retryAfterMs = (header: string | null, now = Date.now()) => {
    if (!header) return null;
    const seconds = Number(header);
    const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
    return Number.isFinite(wait) && wait > 0 ? wait : null;
};

// When autocomplete can next start: its spacing, or tomorrow (UTC) once today's ceiling is used.
export const autocompleteReadyAt = (state: State | undefined, now: Date) => {
    if (!state) return now;
    if (state.day === utcDay(now) && state.dayStarts >= dailyLimit(state)) return nextUtcDay(now);
    return state.nextStartAt > now ? state.nextStartAt : now;
};

const provider = 'autocomplete' as const;
// Raise with `update keyword_mining_capacity set daily_limit=… where provider='autocomplete'`.
const defaultDailyLimit = 1000;
const baseSpacingMs = 10_000;
type State = typeof capacity.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const spacing = (state: State) => Math.max(baseSpacingMs, state.spacingMs ?? 0);
const lockProvider = async (tx: Transaction, now: Date) => {
    await tx.insert(capacity).values({ provider, nextStartAt: now }).onConflictDoNothing();
    const [state] = await tx
        .select()
        .from(capacity)
        .where(eq(capacity.provider, provider))
        .for('update');
    return state;
};
const dailyLimit = (state: State) => state.dailyLimit ?? defaultDailyLimit;
const utcDay = (now: Date) => now.toISOString().slice(0, 10);
const nextUtcDay = (now: Date) =>
    new Date(`${utcDay(new Date(now.getTime() + 86_400_000))}T00:00:00Z`);
