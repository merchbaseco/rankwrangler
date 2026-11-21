import { notifyKeywordQueryRows } from './keyword-directory-notifications';
import { writeKeywordEvents } from './keyword-events';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { DiscoveryScope } from '@/services/discovery-types';
import { KEYWORD_DAY_MS, keywordRetryAt } from '@/services/keyword-collection-policy';
import { catalogQueries } from './catalog-search-schema';
import { discoveryTargets } from './discovery-target-schema';
import { db } from './index';
import { keywordDiscoveryAttempts, keywordExplorationPasses } from './keyword-collection-schema';
import { keywordScanLeaseMs, syncKeywordTargets } from './keyword-target-sync';

const continuing = ['running', 'budget', 'jobCap'];

// Claims a keyword target's pass for one page if it is due and not leased. The target and pass row
// locks keep a duplicate job from claiming twice; queue priority alone decides what runs first.
// Either way the target's scan due time is rewritten, so a listing that sent a job too early
// corrects itself instead of listing the target again.
export const claimKeywordExploration = async (targetId: string, now = new Date()) =>
    db.transaction(async tx => {
        const [candidate] = await tx
            .select({ target: discoveryTargets, query: catalogQueries })
            .from(discoveryTargets)
            .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
            .where(
                and(
                    eq(discoveryTargets.id, targetId),
                    or(eq(discoveryTargets.enabled, true), eq(discoveryTargets.tracking, 'dropped'))
                )
            )
            .for('update', { of: discoveryTargets });
        if (!candidate) return null;
        const { target, query } = candidate;
        const [latest] = await tx
            .select()
            .from(keywordExplorationPasses)
            .where(eq(keywordExplorationPasses.targetId, target.id))
            .orderBy(desc(keywordExplorationPasses.createdAt), desc(keywordExplorationPasses.id))
            .limit(1)
            .for('update');
        // A dropped target may only finish an in-progress one-time depth pass, never start a new one.
        const continuingDepth = Boolean(
            latest && continuing.includes(latest.stopReason) && latest.nextPage > 0
        );
        if (!target.enabled && !continuingDepth) return null;
        if (
            latest &&
            ((continuing.includes(latest.stopReason)
                ? latest.resumeAt
                : new Date(
                      Math.min(latest.resumeAt.getTime(), target.nextCheckAt?.getTime() ?? Infinity)
                  )) > now ||
                (latest.claimAt && latest.claimAt.getTime() > now.getTime() - keywordScanLeaseMs))
        ) {
            await syncKeywordTargets(tx, [target.id]);
            return null;
        }
        let pass = latest;
        const stale =
            pass?.lastPageAt && now.getTime() - pass.lastPageAt.getTime() > KEYWORD_DAY_MS;
        if (stale && continuing.includes(pass.stopReason)) {
            await tx
                .update(keywordExplorationPasses)
                .set({ stopReason: 'cursorExpired', claimAt: null, claimToken: null })
                .where(eq(keywordExplorationPasses.id, pass.id));
            if (!target.enabled) {
                await syncKeywordTargets(tx, [target.id]);
                await notifyKeywordQueryRows(tx, [target.queryId]);
                return null;
            }
        }
        if (!pass || stale || !continuing.includes(pass.stopReason)) {
            [pass] = await tx
                .insert(keywordExplorationPasses)
                .values({ targetId: target.id, resumeAt: now, createdAt: now })
                .returning();
        }
        const [claimed] = await tx
            .update(keywordExplorationPasses)
            .set({ claimAt: now, claimToken: randomUUID(), stopReason: 'running', updatedAt: now })
            .where(eq(keywordExplorationPasses.id, pass.id))
            .returning();
        await tx
            .update(discoveryTargets)
            .set({ lastSelectedAt: now })
            .where(eq(discoveryTargets.id, target.id));
        await syncKeywordTargets(tx, [target.id]);
        await notifyKeywordQueryRows(tx, [target.queryId]);
        let scope: DiscoveryScope;
        if (target.kind === 'brand') {
            if (!target.brandName) throw new Error('Brand target lacks exact provider brand scope');
            scope = { kind: 'brand', term: 'shirt', brandName: target.brandName };
        } else scope = { kind: 'keyword', term: query.displayTerm };
        return { pass: claimed, target, scope, marketplaceId: query.marketplaceId };
    });

export const reserveDiscoveryAttempt = async (input: {
    passId: string;
    claimToken: string;
    page: number;
    now?: Date;
}) =>
    db.transaction(async tx => {
        const [pass] = await tx
            .select()
            .from(keywordExplorationPasses)
            .where(
                and(
                    eq(keywordExplorationPasses.id, input.passId),
                    eq(keywordExplorationPasses.claimToken, input.claimToken),
                    eq(keywordExplorationPasses.nextPage, input.page)
                )
            )
            .for('update');
        if (!pass) return null;
        const now = input.now ?? new Date();
        // The page request starts now: the attempt waits its turn in the Catalog limiter, sends, and
        // is accepted by the checkpoint (or failed or canceled by the stop).
        const [attempt] = await tx
            .insert(keywordDiscoveryAttempts)
            .values({
                passId: pass.id,
                claimToken: input.claimToken,
                page: input.page,
                status: 'started',
                attemptedAt: now,
                startedAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: keywordDiscoveryAttempts.id });
        return attempt?.id ?? null;
    });

type Stop = { passId: string; claimToken: string; attemptId?: string; now?: Date } & (
    | { reason: 'budget'; retryAt: Date }
    | { reason: 'failure' | 'jobCap' | 'complete' }
);
export const stopDiscoveryWork = async (input: Stop) =>
    db.transaction(async tx => {
        const now = input.now ?? new Date();
        const [pass] = await tx
            .select()
            .from(keywordExplorationPasses)
            .where(
                and(
                    eq(keywordExplorationPasses.id, input.passId),
                    eq(keywordExplorationPasses.claimToken, input.claimToken)
                )
            )
            .for('update');
        if (!pass) return null;
        const resumeAt =
            input.reason === 'budget'
                ? input.retryAt
                : input.reason === 'failure'
                  ? keywordRetryAt(pass.failureCount, now)
                  : input.reason === 'jobCap'
                    ? now
                    : pass.resumeAt;
        await tx
            .update(keywordExplorationPasses)
            .set({
                claimAt: null,
                claimToken: null,
                updatedAt: now,
                resumeAt,
                ...(input.reason === 'complete'
                    ? {}
                    : { stopReason: input.reason === 'failure' ? 'running' : input.reason }),
                ...(input.reason === 'failure' ? { failureCount: pass.failureCount + 1 } : {}),
            })
            .where(eq(keywordExplorationPasses.id, pass.id));
        if (input.attemptId)
            await tx
                .update(keywordDiscoveryAttempts)
                .set({
                    status: input.reason === 'failure' ? 'failed' : 'canceled',
                    finishedAt: now,
                })
                .where(
                    and(
                        eq(keywordDiscoveryAttempts.id, input.attemptId),
                        eq(keywordDiscoveryAttempts.passId, pass.id),
                        eq(keywordDiscoveryAttempts.claimToken, input.claimToken),
                        eq(keywordDiscoveryAttempts.status, 'started')
                    )
                );
        if (input.reason === 'failure') {
            const [keyword] = await tx
                .select({ id: catalogQueries.id, term: catalogQueries.normalizedTerm })
                .from(discoveryTargets)
                .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
                .where(
                    and(
                        eq(discoveryTargets.id, pass.targetId),
                        eq(discoveryTargets.kind, 'keyword')
                    )
                );
            if (keyword)
                await writeKeywordEvents(tx, [
                    {
                        ...keyword,
                        action: 'keyword.products.failed',
                        status: 'failed',
                        occurredAt: now,
                        details: {
                            passId: pass.id,
                            page: pass.nextPage,
                            retryAt: resumeAt.toISOString(),
                        },
                    },
                ]);
        }
        await syncKeywordTargets(tx, [pass.targetId]);
        const [target] = await tx
            .select({ queryId: discoveryTargets.queryId })
            .from(discoveryTargets)
            .where(eq(discoveryTargets.id, pass.targetId));
        if (target) await notifyKeywordQueryRows(tx, [target.queryId]);
        return resumeAt;
    });

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Re-opens dropped keyword targets as trials on seasonal Brand Analytics surges (with cooldown).
export const retrialDroppedKeywords = async (
    tx: Transaction,
    input: {
        marketplaceId: string;
        terms: readonly string[];
        now: Date;
        cooldownDays: number;
        reason: string;
        week: string;
    }
) => {
    const unique = [...new Set(input.terms)];
    if (!unique.length) return 0;
    const cooldownBefore = new Date(input.now.getTime() - input.cooldownDays * KEYWORD_DAY_MS);
    let retried = 0;
    for (let start = 0; start < unique.length; start += 1000) {
        const rows = await tx
            .select({
                id: discoveryTargets.id,
                queryId: catalogQueries.id,
                term: catalogQueries.normalizedTerm,
            })
            .from(discoveryTargets)
            .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
            .where(
                and(
                    eq(catalogQueries.source, 'keepa'),
                    eq(catalogQueries.marketplaceId, input.marketplaceId),
                    inArray(catalogQueries.normalizedTerm, unique.slice(start, start + 1000)),
                    eq(discoveryTargets.kind, 'keyword'),
                    eq(discoveryTargets.tracking, 'dropped'),
                    or(
                        isNull(discoveryTargets.headObservedAt),
                        lt(discoveryTargets.headObservedAt, cooldownBefore)
                    )
                )
            )
            .orderBy(discoveryTargets.id)
            .for('update', { of: discoveryTargets });
        if (!rows.length) continue;
        const targetIds = rows.map(row => row.id);
        const queryIds = rows.map(row => row.queryId);
        await tx
            .update(discoveryTargets)
            .set({ tracking: 'trial', enabled: true, nextCheckAt: input.now })
            .where(inArray(discoveryTargets.id, targetIds));
        await tx
            .update(keywordExplorationPasses)
            .set({ stopReason: 'cursorExpired', claimAt: null, claimToken: null })
            .where(
                and(
                    inArray(keywordExplorationPasses.targetId, targetIds),
                    inArray(keywordExplorationPasses.stopReason, continuing)
                )
            );
        await syncKeywordTargets(tx, targetIds);
        await writeKeywordEvents(
            tx,
            rows.map(row => ({
                id: row.queryId,
                term: row.term,
                action: 'keyword.tracking.changed' as const,
                occurredAt: input.now,
                details: { previousTracking: 'dropped', tracking: 'trial', reason: input.reason, week: input.week },
            }))
        );
        await notifyKeywordQueryRows(tx, queryIds);
        retried += rows.length;
    }
    return retried;
};
