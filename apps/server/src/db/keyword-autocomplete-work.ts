import { notifyKeywordQueryRows } from './keyword-directory-notifications';
import { isAutomaticSyncPaused } from './automatic-sync';
import { writeKeywordEvents } from './keyword-events';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from './index';
import { catalogQueries } from './catalog-search-schema';
import { discoveryTargets } from './discovery-target-schema';
import { keywordAutocomplete as expansion } from './keyword-autocomplete-schema';
import { recordDiscoveryCandidates } from './discovery-candidates';
import { normalizeDiscoveryKeyword } from '@/services/discovery-candidate-policy';
import { keywordRetryAt } from '@/services/keyword-collection-policy';

// Claims a tracked seed whose one-time expansion is due. With a queryId, only that seed.
export const claimKeywordAutocomplete = async (now = new Date(), queryId?: string) =>
    db.transaction(async tx => {
        if (await isAutomaticSyncPaused(tx)) return null;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('keyword-autocomplete'))`);
        const [seed] = await tx
            .select({
                queryId: catalogQueries.id,
                term: catalogQueries.normalizedTerm,
                marketplaceId: catalogQueries.marketplaceId,
            })
            .from(catalogQueries)
            .innerJoin(discoveryTargets, eq(discoveryTargets.queryId, catalogQueries.id))
            .leftJoin(expansion, eq(expansion.queryId, catalogQueries.id))
            .where(
                and(
                    eq(catalogQueries.marketplaceId, 'ATVPDKIKX0DER'),
                    eq(discoveryTargets.kind, 'keyword'),
                    eq(discoveryTargets.enabled, true),
                    eq(discoveryTargets.tracking, 'tracked'),
                    queryId ? eq(catalogQueries.id, queryId) : undefined,
                    sql`(${expansion.queryId} is null or (${expansion.stage}<>'complete'
                and ${expansion.nextDueAt}<=${now.toISOString()}::timestamp
                and (${expansion.claimAt} is null or ${expansion.claimAt}<${new Date(now.getTime() - 300_000).toISOString()}::timestamp)))`
                )
            )
            .orderBy(
                sql`${expansion.nextDueAt} asc nulls last`,
                sql`${discoveryTargets.popularityScore} desc nulls last`,
                catalogQueries.id
            )
            .limit(1);
        if (!seed) return null;
        await tx
            .insert(expansion)
            .values({ queryId: seed.queryId, nextDueAt: now })
            .onConflictDoNothing();
        const [owned] = await tx
            .update(expansion)
            .set({ claimToken: randomUUID(), claimAt: now })
            .where(eq(expansion.queryId, seed.queryId))
            .returning();
        await notifyKeywordQueryRows(tx, [seed.queryId]);
        return { ...seed, ...owned, claimToken: owned.claimToken! };
    });
export type AutocompleteWork = NonNullable<Awaited<ReturnType<typeof claimKeywordAutocomplete>>>;

// Saves the suggestions, registers each as a keyword trial and completes the seed in one
// transaction. No model judges them: a trial's first-page scan decides whether it is tracked.
export const finishKeywordAutocomplete = async (
    work: AutocompleteWork,
    phrases: readonly string[],
    now = new Date()
) =>
    db.transaction(async tx => {
        const [owned] = await tx
            .select()
            .from(expansion)
            .where(
                and(eq(expansion.queryId, work.queryId), eq(expansion.claimToken, work.claimToken))
            )
            .for('update');
        if (!owned) throw new Error('Autocomplete claim expired');
        const suggestions = [
            ...new Set(phrases.map(term => normalizeDiscoveryKeyword(term).toLowerCase())),
        ]
            .filter(term => term && term !== work.term)
            .slice(0, 10);
        const registered = await recordDiscoveryCandidates(
            tx,
            suggestions.map(term => ({
                scope: { kind: 'keyword' as const, term },
                evidence: {
                    kind: 'autocomplete' as const,
                    sourceKey: work.queryId,
                    observedAt: now,
                },
            }))
        );
        await tx
            .update(expansion)
            .set({
                stage: 'complete',
                suggestions,
                suggestedAt: now,
                completedAt: now,
                claimAt: null,
                claimToken: null,
                failureCount: 0,
            })
            .where(eq(expansion.queryId, work.queryId));
        await writeKeywordEvents(tx, [
            {
                id: work.queryId,
                term: work.term,
                action: 'keyword.expanded',
                occurredAt: now,
                details: { suggestions: suggestions.length, trials: registered.targets },
            },
        ]);
        await notifyKeywordQueryRows(tx, [work.queryId]);
    });

export const releaseKeywordAutocomplete = async (
    work: AutocompleteWork,
    input: { retryAt?: Date; failed?: boolean; now?: Date } = {}
) =>
    db.transaction(async tx => {
        const now = input.now ?? new Date();
        const released = await tx
            .update(expansion)
            .set({
                claimAt: null,
                claimToken: null,
                nextDueAt:
                    input.retryAt ?? (input.failed ? keywordRetryAt(work.failureCount, now) : now),
                failureCount: work.failureCount + (input.failed ? 1 : 0),
            })
            .where(
                and(eq(expansion.queryId, work.queryId), eq(expansion.claimToken, work.claimToken))
            )
            .returning({ id: expansion.queryId, retryAt: expansion.nextDueAt });
        if (input.failed && released.length)
            await writeKeywordEvents(tx, [
                {
                    id: work.queryId,
                    term: work.term,
                    action: 'keyword.expansion.failed',
                    status: 'failed',
                    occurredAt: now,
                    details: { retryAt: released[0].retryAt.toISOString() },
                },
            ]);
        if (released.length) await notifyKeywordQueryRows(tx, [work.queryId]);
    });
