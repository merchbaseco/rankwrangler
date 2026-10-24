import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from './index';
import { catalogQueries } from './catalog-search-schema';
import {
    keywordDiscoveryAttempts,
    keywordExplorationPasses,
    keywordProducts,
} from './keyword-collection-schema';
import {
    KEYWORD_DAY_MS,
    explorationCheckpoint,
    keywordRetryAt,
} from '@/services/keyword-collection-policy';

const CLAIM_MS = 5 * 60_000;
export const claimKeywordExploration = async (now = new Date()) =>
    await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('keyword-discovery-dispatch'))`);
        const candidates = await tx
            .select()
            .from(catalogQueries)
            .where(
                and(
                    sql`${catalogQueries.tier} <> 'stored'`,
                    sql`not exists (
                        select 1 from (select resume_at, claim_at, stop_reason from keyword_exploration_passes
                            where query_id = ${catalogQueries.id} order by created_at desc, id desc limit 1) latest
                        where latest.resume_at > ${now.toISOString()}::timestamp
                            or latest.claim_at > ${new Date(now.getTime() - CLAIM_MS).toISOString()}::timestamp
                            or (latest.stop_reason in ('lowYield','sourceEnd','providerLimit') and ${catalogQueries.tier} = 'cold')
                    )`,
                    or(
                        isNull(catalogQueries.nextRefreshAttemptAt),
                        lte(catalogQueries.nextRefreshAttemptAt, now)
                    )
                )
            )
            .orderBy(
                sql`${catalogQueries.latestSuccessfulRunAt} desc nulls first`,
                sql`${catalogQueries.lastRequestedAt} desc nulls last`
            )
            .limit(30);
        for (const query of candidates) {
            const [latest] = await tx
                .select()
                .from(keywordExplorationPasses)
                .where(eq(keywordExplorationPasses.queryId, query.id))
                .orderBy(desc(keywordExplorationPasses.createdAt))
                .limit(1);
            if (
                latest &&
                (latest.resumeAt > now ||
                    (latest.claimAt && latest.claimAt.getTime() > now.getTime() - CLAIM_MS))
            )
                continue;
            if (
                latest &&
                ['lowYield', 'sourceEnd', 'providerLimit'].includes(latest.stopReason) &&
                query.tier === 'cold'
            )
                continue;
            let pass = latest;
            if (!pass || !['running', 'budget', 'jobCap'].includes(pass.stopReason)) {
                [pass] = await tx
                    .insert(keywordExplorationPasses)
                    .values({ queryId: query.id })
                    .returning();
            }
            if (!pass) throw new Error('Cannot create discovery pass.');
            const staleFrontier =
                pass.lastPageAt && now.getTime() - pass.lastPageAt.getTime() > KEYWORD_DAY_MS;
            const [claimed] = await tx
                .update(keywordExplorationPasses)
                .set({
                    claimAt: now,
                    ...(staleFrontier
                        ? {
                              nextPage: 0,
                              nextPageToken: null,
                              contiguousPages: 0,
                              oldestPageAt: null,
                              lowYieldPages: 0,
                          }
                        : {}),
                    stopReason: 'running',
                    updatedAt: now,
                })
                .where(eq(keywordExplorationPasses.id, pass.id))
                .returning();
            return claimed ? { pass: claimed, term: query.displayTerm, tier: query.tier } : null;
        }
        return null;
    });

export const reserveDiscoveryAttempt = async (input: {
    passId: string;
    queryId: string;
    page: number;
    claimAt: Date;
    now?: Date;
}) =>
    await db.transaction(async tx => {
        const now = input.now ?? new Date();
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('keyword-discovery-budget'))`);
        const [pass] = await tx
            .select()
            .from(keywordExplorationPasses)
            .where(
                and(
                    eq(keywordExplorationPasses.id, input.passId),
                    eq(keywordExplorationPasses.claimAt, input.claimAt)
                )
            );
        if (!pass) return null;
        const [spent] = await tx
            .select({
                all: sql<number>`count(*)::int`,
                term: sql<number>`count(*) filter (where ${keywordDiscoveryAttempts.queryId} = ${input.queryId})::int`,
            })
            .from(keywordDiscoveryAttempts)
            .where(
                gt(keywordDiscoveryAttempts.attemptedAt, new Date(now.getTime() - KEYWORD_DAY_MS))
            );
        if ((spent?.all ?? 0) >= 20 || (spent?.term ?? 0) >= 10) return null;
        const [attempt] = await tx
            .insert(keywordDiscoveryAttempts)
            .values({
                passId: input.passId,
                queryId: input.queryId,
                page: input.page,
                attemptedAt: now,
            })
            .returning({ id: keywordDiscoveryAttempts.id });
        return attempt?.id ?? null;
    });

export const checkpointDiscoveryPage = async <T>(input: {
    passId: string;
    claimAt: Date;
    attemptId: string;
    page: number;
    nextPageToken: string | null;
    observedAt: Date;
    products: T[];
    persist: (
        tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
        products: T[]
    ) => Promise<{ productIds: string[]; merchProductIds: string[] }>;
}) =>
    await db.transaction(async tx => {
        const [pass] = await tx
            .select()
            .from(keywordExplorationPasses)
            .where(
                and(
                    eq(keywordExplorationPasses.id, input.passId),
                    eq(keywordExplorationPasses.claimAt, input.claimAt)
                )
            )
            .for('update');
        if (!pass) throw new Error('Discovery execution ownership expired.');
        const persisted = await input.persist(tx, input.products);
        if (persisted.merchProductIds.length)
            await tx
                .update(catalogQueries)
                .set({ merchObservedAt: input.observedAt, updatedAt: input.observedAt })
                .where(eq(catalogQueries.id, pass.queryId));
        let newMerchCount = 0;
        if (persisted.productIds.length) {
            const added = await tx
                .insert(keywordProducts)
                .values(
                    persisted.productIds.map(productId => ({
                        queryId: pass.queryId,
                        productId,
                        firstObservedAt: input.observedAt,
                        lastObservedAt: input.observedAt,
                    }))
                )
                .onConflictDoNothing()
                .returning();
            newMerchCount = added.filter(row =>
                persisted.merchProductIds.includes(row.productId)
            ).length;
            await tx
                .update(keywordProducts)
                .set({ lastObservedAt: input.observedAt })
                .where(
                    and(
                        eq(keywordProducts.queryId, pass.queryId),
                        inArray(keywordProducts.productId, persisted.productIds)
                    )
                );
        }
        const checkpoint = explorationCheckpoint({
            ...pass,
            page: input.page,
            newMerchCount,
            resultCount: input.products.length,
        });
        const fingerprint = [...persisted.productIds].sort().join(',');
        if (input.page > 0 && pass.lastPageFingerprint === fingerprint && fingerprint) {
            checkpoint.stopReason = 'providerLimit';
            checkpoint.contiguousPages = pass.contiguousPages;
        }
        if (input.nextPageToken && input.nextPageToken === pass.nextPageToken)
            checkpoint.stopReason = 'providerLimit';
        if (!input.nextPageToken) checkpoint.stopReason = 'sourceEnd';
        const [query] = await tx
            .select({ tier: catalogQueries.tier })
            .from(catalogQueries)
            .where(eq(catalogQueries.id, pass.queryId));
        const stopped = checkpoint.stopReason !== 'running';
        const [next] = await tx
            .update(keywordExplorationPasses)
            .set({
                ...checkpoint,
                nextPageToken: input.nextPageToken,
                lastPageFingerprint: fingerprint,
                oldestPageAt: pass.oldestPageAt ?? input.observedAt,
                lastPageAt: input.observedAt,
                failureCount: 0,
                updatedAt: input.observedAt,
                resumeAt: stopped
                    ? new Date(
                          input.observedAt.getTime() +
                              (query?.tier === 'hot' ? 30 : 60) * KEYWORD_DAY_MS
                      )
                    : input.observedAt,
            })
            .where(eq(keywordExplorationPasses.id, pass.id))
            .returning();
        await tx
            .update(keywordDiscoveryAttempts)
            .set({ status: 'accepted' })
            .where(eq(keywordDiscoveryAttempts.id, input.attemptId));
        return next;
    });

export const stopDiscoveryWork = async ({
    passId,
    claimAt,
    reason,
    now = new Date(),
}: {
    passId: string;
    claimAt: Date;
    reason: 'budget' | 'failure' | 'jobCap' | 'complete';
    now?: Date;
}) => {
    const [pass] = await db
        .select()
        .from(keywordExplorationPasses)
        .where(eq(keywordExplorationPasses.id, passId));
    if (!pass) return;
    await db
        .update(keywordExplorationPasses)
        .set({
            claimAt: null,
            updatedAt: now,
            ...(reason === 'complete'
                ? {}
                : { stopReason: reason === 'failure' ? 'running' : reason }),
            resumeAt:
                reason === 'failure'
                    ? keywordRetryAt(pass.failureCount, now)
                    : reason === 'budget'
                      ? new Date(now.getTime() + 60_000)
                      : pass.resumeAt,
            ...(reason === 'failure' ? { failureCount: pass.failureCount + 1 } : {}),
        })
        .where(
            and(
                eq(keywordExplorationPasses.id, passId),
                eq(keywordExplorationPasses.claimAt, claimAt)
            )
        );
};
