import { isAutomaticSyncPaused } from './automatic-sync';
import { writeKeywordEvents } from './keyword-events';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from './index';
import { catalogQueries } from './catalog-search-schema';
import { discoveryTargets } from './discovery-target-schema';
import {
    keywordAutocomplete as expansion,
    autocompleteKeywordCandidates as links,
} from './keyword-autocomplete-schema';
import { minedKeywordCandidates as candidates } from './keyword-mining-schema';
import {
    saveCandidateTerms,
    claimCandidateJudgments,
    releaseCandidateJudgments,
} from './mined-keyword-candidates';
import { recordDiscoveryCandidates } from './discovery-candidates';
import { keywordRetryAt } from '@/services/keyword-collection-policy';

export const claimKeywordAutocomplete = async (now = new Date()) =>
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
                    sql`(${expansion.queryId} is null or (${expansion.stage}<>'complete' and ${expansion.nextDueAt}<=${now.toISOString()}::timestamp
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
        return { ...seed, ...owned, claimToken: owned.claimToken! };
    });
export type AutocompleteWork = NonNullable<Awaited<ReturnType<typeof claimKeywordAutocomplete>>>;

export const saveAutocompleteSuggestions = async (
    work: AutocompleteWork,
    phrases: string[],
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
        if (owned.stage !== 'pending') return;
        const { terms, ids } = await saveCandidateTerms(
            tx,
            work.marketplaceId,
            phrases
                .filter(term => term.trim().replace(/\s+/gu, ' ').toLowerCase() !== work.term)
                .slice(0, 10),
            now
        );
        if (ids.length)
            await tx
                .insert(links)
                .values(ids.map(candidateId => ({ queryId: work.queryId, candidateId })))
                .onConflictDoNothing();
        await tx
            .update(expansion)
            .set({
                stage: 'suggestionsSaved',
                suggestions: terms,
                suggestedAt: now,
                failureCount: 0,
            })
            .where(eq(expansion.queryId, work.queryId));
    });

export const claimAutocompleteJudgments = async (work: AutocompleteWork, now = new Date()) =>
    db.transaction(async tx => {
        const [owned] = await tx
            .select()
            .from(expansion)
            .where(
                and(eq(expansion.queryId, work.queryId), eq(expansion.claimToken, work.claimToken))
            )
            .for('update');
        if (!owned || owned.stage !== 'suggestionsSaved')
            throw new Error('Autocomplete claim expired');
        const rows = await tx
            .select({ id: links.candidateId })
            .from(links)
            .where(eq(links.queryId, work.queryId));
        return claimCandidateJudgments(
            tx,
            work.claimToken,
            rows.map(row => row.id),
            now
        );
    });

export const finishKeywordAutocomplete = async (work: AutocompleteWork, now = new Date()) =>
    db.transaction(async tx => {
        const [owned] = await tx
            .select()
            .from(expansion)
            .where(
                and(eq(expansion.queryId, work.queryId), eq(expansion.claimToken, work.claimToken))
            )
            .for('update');
        if (!owned || owned.stage !== 'suggestionsSaved') return false;
        const rows = await tx
            .select({ candidate: candidates })
            .from(links)
            .innerJoin(candidates, eq(candidates.id, links.candidateId))
            .where(eq(links.queryId, work.queryId));
        if (rows.some(row => row.candidate.verdict === null)) return false;
        await recordDiscoveryCandidates(
            tx,
            rows
                .filter(row => row.candidate.verdict === 'accepted')
                .map(({ candidate }) => ({
                    scope: { kind: 'keyword' as const, term: candidate.term },
                    evidence: {
                        kind: 'autocomplete' as const,
                        sourceKey: work.queryId,
                        observedAt: owned.suggestedAt ?? now,
                    },
                }))
        );
        await tx
            .update(expansion)
            .set({
                stage: 'complete',
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
                details: {
                    suggestions: owned.suggestions?.length ?? 0,
                    accepted: rows.filter(row => row.candidate.verdict === 'accepted').length,
                },
            },
        ]);
        return true;
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
        await releaseCandidateJudgments(tx, work.claimToken);
    });
