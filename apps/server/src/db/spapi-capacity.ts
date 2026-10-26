import { isAutomaticSyncPaused } from './automatic-sync';
import { and, eq } from 'drizzle-orm';
import {
    catalogCapacityDecision,
    catalogCapacityObservation,
} from '@/services/catalog-capacity-policy';
import type { CatalogCapacity } from '@/services/providers/sp-api/sp-api-catalog-capacity';
import { db } from './index';
import { spApiCatalogCapacity } from './spapi-capacity-schema';
import { keywordDiscoveryAttempts, keywordExplorationPasses } from './keyword-collection-schema';

const lockCapacity = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], now: Date) => {
    await tx.insert(spApiCatalogCapacity).values({ id: 1, updatedAt: now }).onConflictDoNothing();
    const [state] = await tx
        .select()
        .from(spApiCatalogCapacity)
        .where(eq(spApiCatalogCapacity.id, 1))
        .for('update');
    return state;
};

export const reserveCatalogCapacity: CatalogCapacity['reserve'] = async input =>
    db.transaction(async tx => {
        const now = input.now ?? new Date();
        if (input.priority === 'background' && (await isAutomaticSyncPaused(tx)))
            return {
                kind: 'deferred',
                reason: 'paused',
                retryAt: new Date(now.getTime() + 60_000),
            };
        const state = await lockCapacity(tx, now);
        const decision = catalogCapacityDecision(state, { ...input, now });
        if (decision.kind === 'deferred') {
            if (decision.reason === 'protectedWork')
                await tx
                    .update(spApiCatalogCapacity)
                    .set({ backgroundPausedUntil: decision.retryAt })
                    .where(eq(spApiCatalogCapacity.id, 1));
            return { kind: decision.kind, reason: decision.reason, retryAt: decision.retryAt };
        }
        if (input.priority === 'background') {
            if (!input.attemptId)
                throw new Error('Background Catalog request needs a durable page attempt');
            const rows = await tx
                .select({ attempt: keywordDiscoveryAttempts, pass: keywordExplorationPasses })
                .from(keywordDiscoveryAttempts)
                .innerJoin(
                    keywordExplorationPasses,
                    eq(keywordExplorationPasses.id, keywordDiscoveryAttempts.passId)
                )
                .where(
                    and(
                        eq(keywordDiscoveryAttempts.id, input.attemptId),
                        eq(keywordDiscoveryAttempts.status, 'reserved')
                    )
                )
                .for('update', { of: keywordExplorationPasses });
            const row = rows[0];
            if (
                !row?.pass.claimToken ||
                row.attempt.claimToken !== row.pass.claimToken ||
                !row.pass.claimAt ||
                row.pass.claimAt < new Date(now.getTime() - 300_000) ||
                row.pass.nextPage !== row.attempt.page
            )
                throw new Error('Discovery dispatch ownership expired');
            await tx
                .update(keywordDiscoveryAttempts)
                .set({ status: 'started', startedAt: now })
                .where(eq(keywordDiscoveryAttempts.id, input.attemptId));
        }
        await tx
            .update(spApiCatalogCapacity)
            .set({
                tokens: decision.balance.tokens,
                backgroundTokens: decision.balance.backgroundTokens,
                updatedAt: now,
                foregroundStarts:
                    state.foregroundStarts + (input.priority === 'foreground' ? 1 : 0),
                backgroundStarts:
                    state.backgroundStarts + (input.priority === 'background' ? 1 : 0),
            })
            .where(eq(spApiCatalogCapacity.id, 1));
        return { kind: 'granted' };
    });

export const observeCatalogCapacity: CatalogCapacity['observe'] = async input =>
    db.transaction(async tx => {
        const now = input.now ?? new Date();
        const state = await lockCapacity(tx, now);
        await tx
            .update(spApiCatalogCapacity)
            .set(catalogCapacityObservation(state, { ...input, now }))
            .where(eq(spApiCatalogCapacity.id, 1));
        if (input.attemptId) {
            await tx
                .update(keywordDiscoveryAttempts)
                .set({ status: input.failed ? 'failed' : 'fetched', finishedAt: now })
                .where(
                    and(
                        eq(keywordDiscoveryAttempts.id, input.attemptId),
                        eq(keywordDiscoveryAttempts.status, 'started')
                    )
                );
        }
    });

export const readCatalogCapacity = async () => {
    const [state] = await db
        .select()
        .from(spApiCatalogCapacity)
        .where(eq(spApiCatalogCapacity.id, 1));
    return state ?? null;
};
