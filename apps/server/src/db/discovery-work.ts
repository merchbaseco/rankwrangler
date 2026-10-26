import { isAutomaticSyncPaused } from './automatic-sync';
import { writeKeywordEvents } from './keyword-events';
import { catalogCapacityDecision } from '@/services/catalog-capacity-policy';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DiscoveryScope } from '@/services/discovery-types';
import { KEYWORD_DAY_MS, keywordRetryAt } from '@/services/keyword-collection-policy';
import { catalogQueries } from './catalog-search-schema';
import { discoveryTargets } from './discovery-target-schema';
import { db } from './index';
import { keywordDiscoveryAttempts, keywordExplorationPasses } from './keyword-collection-schema';
import { spApiCatalogCapacity } from './spapi-capacity-schema';

const leaseMs = 300_000;
const continuing = ['running', 'budget', 'jobCap'];

export const claimKeywordExploration = async (now = new Date()) =>
    db.transaction(async tx => {
        if (await isAutomaticSyncPaused(tx)) return null;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('catalog-discovery-dispatch'))`);
        await tx
            .insert(spApiCatalogCapacity)
            .values({ id: 1, updatedAt: now })
            .onConflictDoNothing();
        const [capacity] = await tx
            .select()
            .from(spApiCatalogCapacity)
            .where(eq(spApiCatalogCapacity.id, 1))
            .for('update');
        const trialTurn = (capacity?.discoveryClaims ?? 0) % 5 === 0;
        const [candidate] = await tx
            .select({ target: discoveryTargets, query: catalogQueries })
            .from(discoveryTargets)
            .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
            .where(
                and(
                    eq(discoveryTargets.enabled, true),
                    sql`not exists (
            select 1 from (select resume_at,claim_at,stop_reason from keyword_exploration_passes
                where target_id=${discoveryTargets.id} order by created_at desc,id desc limit 1) latest
            where (case when latest.stop_reason in ('running','budget','jobCap') then latest.resume_at
                    else least(latest.resume_at,coalesce(${discoveryTargets.nextCheckAt},latest.resume_at)) end) > ${now.toISOString()}::timestamp
                or latest.claim_at > ${new Date(now.getTime() - leaseMs).toISOString()}::timestamp
        )`
                )
            )
            .orderBy(
                sql`case when ${discoveryTargets.tracking}=${trialTurn ? 'trial' : 'tracked'} then 0 else 1 end`,
                sql`case when ${discoveryTargets.headObservedAt} is null then 1 else
                    greatest(0,extract(epoch from(${now.toISOString()}::timestamp-coalesce(${discoveryTargets.nextCheckAt},${now.toISOString()}::timestamp))))
                    /greatest(${discoveryTargets.intervalDays}*86400,1) end desc`,
                sql`${discoveryTargets.lastSelectedAt} asc nulls first`,
                discoveryTargets.createdAt,
                discoveryTargets.id
            )
            .limit(1);
        if (!candidate) return null;
        await tx
            .update(spApiCatalogCapacity)
            .set({ discoveryClaims: capacity.discoveryClaims + 1 })
            .where(eq(spApiCatalogCapacity.id, 1));
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
        const [attempt] = await tx
            .insert(keywordDiscoveryAttempts)
            .values({
                passId: pass.id,
                claimToken: input.claimToken,
                page: input.page,
                attemptedAt: input.now ?? new Date(),
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
        const [capacity] =
            input.reason === 'failure'
                ? await tx.select().from(spApiCatalogCapacity).where(eq(spApiCatalogCapacity.id, 1))
                : [];
        const resumeAt =
            input.reason === 'budget'
                ? input.retryAt
                : input.reason === 'failure'
                  ? new Date(
                        Math.max(
                            keywordRetryAt(pass.failureCount, now).getTime(),
                            capacity?.cooldownUntil?.getTime() ?? 0
                        )
                    )
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
                        inArray(keywordDiscoveryAttempts.status, ['reserved', 'started', 'fetched'])
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
        return resumeAt;
    });

export const nextDiscoveryWakeAt = async (now = new Date()) => {
    if (await isAutomaticSyncPaused()) return null;
    const [row] = await db.execute<{ epoch: number | null }>(sql`
        select extract(epoch from min(greatest(
            coalesce(case when latest.stop_reason in ('running','budget','jobCap') then latest.resume_at
                else least(latest.resume_at,coalesce(t.next_check_at,latest.resume_at)) end,${now.toISOString()}::timestamp),
            coalesce(latest.claim_at+interval '5 minutes',${now.toISOString()}::timestamp),
            ${now.toISOString()}::timestamp)))::double precision epoch
        from discovery_targets t left join lateral (
            select resume_at,claim_at,stop_reason from keyword_exploration_passes where target_id=t.id
            order by created_at desc,id desc limit 1
        ) latest on true where t.enabled
    `);
    if (row?.epoch === null || row?.epoch === undefined) return null;
    const [capacity] = await db
        .select()
        .from(spApiCatalogCapacity)
        .where(eq(spApiCatalogCapacity.id, 1));
    const decision = capacity
        ? catalogCapacityDecision(capacity, { priority: 'background', protectedQueued: false, now })
        : null;
    return new Date(
        Math.max(
            Math.ceil(row.epoch * 1000),
            decision?.kind === 'deferred' ? decision.retryAt.getTime() : now.getTime()
        )
    );
};
