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
        await tx
            .update(keywordMiningCapacity)
            .set({
                nextStartAt: new Date(now.getTime() + (provider === 'jev' ? 2000 : 10_000)),
                starts: state.starts + 1,
            })
            .where(eq(keywordMiningCapacity.provider, provider));
    });
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
