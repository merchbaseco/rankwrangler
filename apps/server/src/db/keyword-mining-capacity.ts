import { isAutomaticSyncPaused } from './automatic-sync';
import { eq, sql } from 'drizzle-orm';
import { db } from './index';
import { keywordMiningCapacity } from './keyword-mining-schema';
export class KeywordMiningDeferred extends Error {
    constructor(readonly retryAt: Date) {
        super('Keyword mining capacity deferred');
    }
}
export const reserveKeywordMiningCall = async (
    provider: 'ads' | 'jev' | 'autocomplete',
    now = new Date()
) =>
    db.transaction(async tx => {
        if (await isAutomaticSyncPaused(tx))
            throw new KeywordMiningDeferred(new Date(now.getTime() + 60_000));
        await tx
            .insert(keywordMiningCapacity)
            .values({ provider, nextStartAt: now })
            .onConflictDoNothing();
        const [state] = await tx
            .select()
            .from(keywordMiningCapacity)
            .where(eq(keywordMiningCapacity.provider, provider))
            .for('update');
        if (state.nextStartAt > now) throw new KeywordMiningDeferred(state.nextStartAt);
        const day = utcDay(now);
        const dayStarts = state.day === day ? state.dayStarts : 0;
        if (dayStarts >= dailyLimit(state)) throw new KeywordMiningDeferred(nextUtcDay(now));
        await tx
            .update(keywordMiningCapacity)
            .set({
                nextStartAt: new Date(now.getTime() + (provider === 'jev' ? 2000 : 10_000)),
                starts: state.starts + 1,
                day,
                dayStarts: dayStarts + 1,
                dayTokens: state.day === day ? state.dayTokens : 0,
            })
            .where(eq(keywordMiningCapacity.provider, provider));
    });

// Adds a response's token usage to today's total, for spend monitoring.
export const recordKeywordMiningTokens = async (
    provider: 'jev',
    tokens: number,
    now = new Date()
) => {
    await db
        .update(keywordMiningCapacity)
        .set({ dayTokens: sql`${keywordMiningCapacity.dayTokens}+${Math.round(tokens)}` })
        .where(
            sql`${keywordMiningCapacity.provider}=${provider} and ${keywordMiningCapacity.day}=${utcDay(now)}`
        );
};

// Today's admitted starts against each provider's ceiling, and Jev tokens, for operators.
export const readKeywordProviderUsage = async (now = new Date()) => {
    const rows = await db.select().from(keywordMiningCapacity);
    return (['ads', 'jev', 'autocomplete'] as const).map(provider => {
        const state = rows.find(row => row.provider === provider);
        const today = state?.day === utcDay(now);
        return {
            provider,
            startsToday: today ? state.dayStarts : 0,
            dailyLimit: state?.dailyLimit ?? defaultDailyLimits[provider],
            tokensToday: today ? state.dayTokens : 0,
        };
    });
};

// When a provider can next start: its spacing, or tomorrow (UTC) once today's ceiling is used.
export const keywordProviderReadyAt = (
    state: typeof keywordMiningCapacity.$inferSelect | undefined,
    now: Date
) => {
    if (!state) return now;
    if (state.day === utcDay(now) && state.dayStarts >= dailyLimit(state)) return nextUtcDay(now);
    return state.nextStartAt > now ? state.nextStartAt : now;
};
export const deferKeywordMiningProvider = async (
    provider: 'ads' | 'jev' | 'autocomplete',
    retryAt: Date
) => {
    await db
        .insert(keywordMiningCapacity)
        .values({ provider, nextStartAt: retryAt })
        .onConflictDoUpdate({
            target: keywordMiningCapacity.provider,
            set: {
                nextStartAt: sql`greatest(keyword_mining_capacity.next_start_at,excluded.next_start_at)`,
            },
        });
};

// Day-one ceilings: about 500 mined products, their judgments and seed expansions. Raise one
// provider with `update keyword_mining_capacity set daily_limit=… where provider=…`.
const defaultDailyLimits = { ads: 500, jev: 2000, autocomplete: 1000 } as const;
const dailyLimit = (state: typeof keywordMiningCapacity.$inferSelect) =>
    state.dailyLimit ?? defaultDailyLimits[state.provider];
const utcDay = (now: Date) => now.toISOString().slice(0, 10);
const nextUtcDay = (now: Date) => new Date(`${utcDay(new Date(now.getTime() + 86_400_000))}T00:00:00Z`);
