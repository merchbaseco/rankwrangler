import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { keywordRetryAt } from '@/services/keyword-collection-policy';
import { isAutomaticSyncPaused } from './automatic-sync';
import { recordDiscoveryCandidates } from './discovery-candidates';
import { db } from './index';
import { keywordPrefixes as prefixes } from './keyword-prefix-schema';

const leaseMs = 300_000;

// Claims a prefix whose one-time autocomplete expansion is due. With a prefixId, only that prefix.
// Shares the keyword autocomplete lock, pacing and daily ceiling, and waits while sync is paused.
export const claimPrefixAutocomplete = async (now = new Date(), prefixId?: string) =>
    db.transaction(async tx => {
        if (await isAutomaticSyncPaused(tx)) return null;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('keyword-autocomplete'))`);
        const [due] = await tx
            .select()
            .from(prefixes)
            .where(
                and(
                    eq(prefixes.marketplaceId, 'ATVPDKIKX0DER'),
                    prefixId ? eq(prefixes.id, prefixId) : undefined,
                    sql`${prefixes.stage}<>'complete' and ${prefixes.nextDueAt}<=${now.toISOString()}::timestamp
                and (${prefixes.claimAt} is null or ${prefixes.claimAt}<${new Date(now.getTime() - leaseMs).toISOString()}::timestamp)`
                )
            )
            .orderBy(prefixes.nextDueAt, prefixes.createdAt, prefixes.id)
            .limit(1)
            .for('update', { skipLocked: true });
        if (!due) return null;
        const [owned] = await tx
            .update(prefixes)
            .set({ claimToken: randomUUID(), claimAt: now })
            .where(eq(prefixes.id, due.id))
            .returning();
        return { ...owned, claimToken: owned.claimToken! };
    });
export type PrefixAutocompleteWork = NonNullable<
    Awaited<ReturnType<typeof claimPrefixAutocomplete>>
>;

// Saves the prefix's suggestions, registers the kept ones as keyword trials with
// `prefixAutocomplete` evidence naming the prefix, and completes the prefix in one transaction.
export const finishPrefixAutocomplete = async (
    work: PrefixAutocompleteWork,
    suggestions: readonly string[],
    trials: readonly string[],
    now = new Date()
) =>
    db.transaction(async tx => {
        const [owned] = await tx
            .select({ id: prefixes.id })
            .from(prefixes)
            .where(ownedBy(work))
            .for('update');
        if (!owned) throw new Error('Prefix autocomplete claim expired');
        await recordDiscoveryCandidates(
            tx,
            trials.map(term => ({
                scope: { kind: 'keyword' as const, term },
                evidence: {
                    kind: 'prefixAutocomplete' as const,
                    sourceKey: work.prefix,
                    observedAt: now,
                },
            }))
        );
        await tx
            .update(prefixes)
            .set({
                stage: 'complete',
                suggestions: [...suggestions],
                trialCount: trials.length,
                completedAt: now,
                claimToken: null,
                claimAt: null,
                failureCount: 0,
            })
            .where(eq(prefixes.id, work.id));
    });

export const releasePrefixAutocomplete = async (
    work: PrefixAutocompleteWork,
    input: { retryAt?: Date; failed?: boolean; now?: Date } = {}
) => {
    const now = input.now ?? new Date();
    await db
        .update(prefixes)
        .set({
            claimToken: null,
            claimAt: null,
            nextDueAt:
                input.retryAt ?? (input.failed ? keywordRetryAt(work.failureCount, now) : now),
            failureCount: work.failureCount + (input.failed ? 1 : 0),
        })
        .where(ownedBy(work));
};

const ownedBy = (work: PrefixAutocompleteWork) =>
    and(eq(prefixes.id, work.id), eq(prefixes.claimToken, work.claimToken));
