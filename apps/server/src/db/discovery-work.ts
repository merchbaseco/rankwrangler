import { notifyKeywordQueryRows } from './keyword-directory-notifications';
import { writeKeywordEvents } from './keyword-events';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { DiscoveryScope } from '@/services/discovery-types';
import { KEYWORD_DAY_MS, keywordRetryAt } from '@/services/keyword-collection-policy';
import { catalogQueries } from './catalog-search-schema';
import { discoveryTargets } from './discovery-target-schema';
import { db } from './index';
import { keywordDiscoveryAttempts, keywordExplorationPasses } from './keyword-collection-schema';

const leaseMs = 300_000;
const continuing = ['running', 'budget', 'jobCap'];

// Claims a keyword target's pass for one page if it is due and not leased. The target and pass row
// locks keep a duplicate job from claiming twice; queue priority alone decides what runs first.
export const claimKeywordExploration = async (targetId: string, now = new Date()) =>
    db.transaction(async tx => {
        const [candidate] = await tx
            .select({ target: discoveryTargets, query: catalogQueries })
            .from(discoveryTargets)
            .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
            .where(and(eq(discoveryTargets.id, targetId), eq(discoveryTargets.enabled, true)))
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
        if (
            latest &&
            ((continuing.includes(latest.stopReason)
                ? latest.resumeAt
                : new Date(
                      Math.min(latest.resumeAt.getTime(), target.nextCheckAt?.getTime() ?? Infinity)
                  )) > now ||
                (latest.claimAt && latest.claimAt.getTime() > now.getTime() - leaseMs))
        )
            return null;
        let pass = latest;
        const stale =
            pass?.lastPageAt && now.getTime() - pass.lastPageAt.getTime() > KEYWORD_DAY_MS;
        if (stale && continuing.includes(pass.stopReason)) {
            await tx
                .update(keywordExplorationPasses)
                .set({ stopReason: 'cursorExpired', claimAt: null, claimToken: null })
                .where(eq(keywordExplorationPasses.id, pass.id));
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
        const [target] = await tx
            .select({ queryId: discoveryTargets.queryId })
            .from(discoveryTargets)
            .where(eq(discoveryTargets.id, pass.targetId));
        if (target) await notifyKeywordQueryRows(tx, [target.queryId]);
        return resumeAt;
    });
