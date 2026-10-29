import { lockKeywordScheduling } from './keyword-scheduling-lock';
import { and, asc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from './index';
import { catalogQueries } from './catalog-search-schema';
import { operations } from './ops-schema';
import { lockCatalogQueryForReconciliation } from './catalog-query-resolution';
import { mapOperationRecord } from './operations';
import { getKeepaAdmissionCapacity } from '@/services/keepa-capacity';
import { KEYWORD_DAY_MS } from '@/services/keyword-collection-policy';
import type { CatalogSearchOperationInput } from '@/services/operations';

export const admitKeywordCandidates = async (now = new Date()) => {
    const capacity = await getKeepaAdmissionCapacity();
    if (!capacity) return 0;
    return await db.transaction(async tx => {
        await lockKeywordScheduling(tx);
        const [load] = await tx
            .select({
                daily: sql<number>`coalesce(sum(${capacity.headCost}::numeric / greatest(${catalogQueries.intervalDays}, 1)), 0)::float`,
            })
            .from(catalogQueries)
            .where(sql`${catalogQueries.tier} <> 'stored'`);
        const allowance = capacity.refillRate * 1440 * 0.2 * 0.9;
        const [unobserved] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(catalogQueries)
            .where(
                and(
                    sql`${catalogQueries.tier} <> 'stored'`,
                    isNull(catalogQueries.latestSuccessfulRunAt)
                )
            );
        let initialSlots = Math.max(0, 20 - (unobserved?.count ?? 0));
        let forecast = load?.daily ?? 0;
        let count = 0;
        const candidates = await tx
            .select()
            .from(catalogQueries)
            .where(
                and(
                    or(
                        eq(catalogQueries.tier, 'stored'),
                        and(
                            gt(catalogQueries.activeUntil, now),
                            sql`${catalogQueries.tier} <> 'hot'`
                        )
                    ),
                    or(
                        isNull(catalogQueries.admittedAt),
                        sql`${catalogQueries.lastRequestedAt} > ${catalogQueries.admittedAt}`,
                        gt(catalogQueries.activeUntil, now)
                    ),
                    or(
                        gt(
                            catalogQueries.lastRequestedAt,
                            new Date(now.getTime() - 30 * KEYWORD_DAY_MS)
                        ),
                        gt(catalogQueries.activeUntil, now)
                    )
                )
            )
            .orderBy(
                sql`${catalogQueries.activeUntil} desc nulls last`,
                sql`${catalogQueries.lastRequestedAt} desc nulls last`,
                asc(catalogQueries.createdAt)
            )
            .limit(20);
        for (const candidate of candidates) {
            await lockCatalogQueryForReconciliation(tx, candidate.id);
            const [query] = await tx
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.id, candidate.id));
            if (!query) continue;
            if (!query.latestSuccessfulRunAt && initialSlots <= 0) continue;
            const leased = Boolean(query.activeUntil && query.activeUntil > now);
            const cost =
                capacity.headCost / (leased ? 1 : 7) -
                (query.tier === 'stored' ? 0 : capacity.headCost / query.intervalDays);
            if (forecast + cost > allowance) break;
            forecast += cost;
            if (!query.latestSuccessfulRunAt) initialSlots -= 1;
            await tx
                .update(catalogQueries)
                .set({
                    tier: leased ? 'hot' : 'probation',
                    admissionReason: leased ? 'researchLease' : 'candidateProbe',
                    admittedAt: now,
                    probationUntil: new Date(now.getTime() + 30 * KEYWORD_DAY_MS),
                    nextDueAt: query.latestSuccessfulRunAt
                        ? new Date(
                              Math.max(
                                  now.getTime(),
                                  query.latestSuccessfulRunAt.getTime() +
                                      (leased ? 1 : 7) * KEYWORD_DAY_MS
                              )
                          )
                        : now,
                    intervalDays: leased ? 1 : 7,
                    updatedAt: now,
                })
                .where(eq(catalogQueries.id, query.id));
            count += 1;
        }
        return count;
    });
};

export const retireKeywordAdmissions = async (now = new Date()) => {
    await db.transaction(async tx => {
        await lockKeywordScheduling(tx);
        await tx
            .update(catalogQueries)
            .set({
                tier: 'cold',
                intervalDays: 30,
                nextDueAt: now,
                admissionReason: 'leaseExpired',
                updatedAt: now,
            })
            .where(
                and(
                    eq(catalogQueries.admissionReason, 'researchLease'),
                    lte(catalogQueries.activeUntil, now)
                )
            );

        await tx
            .update(catalogQueries)
            .set({
                tier: 'stored',
                admissionReason: 'probationExpired',
                nextDueAt: null,
                updatedAt: now,
            })
            .where(
                and(
                    eq(catalogQueries.tier, 'probation'),
                    lte(catalogQueries.probationUntil, now),
                    isNull(catalogQueries.merchObservedAt),
                    or(isNull(catalogQueries.activeUntil), lte(catalogQueries.activeUntil, now))
                )
            );
        await tx
            .update(catalogQueries)
            .set({ tier: 'cold', intervalDays: 30, nextDueAt: now, updatedAt: now })
            .where(
                and(
                    eq(catalogQueries.tier, 'probation'),
                    lte(catalogQueries.probationUntil, now),
                    sql`${catalogQueries.merchObservedAt} is not null`
                )
            );
        await tx
            .update(catalogQueries)
            .set({ tier: 'stored', admissionReason: 'inactive', nextDueAt: null, updatedAt: now })
            .where(
                and(
                    sql`${catalogQueries.tier} <> 'stored'`,
                    or(isNull(catalogQueries.activeUntil), lte(catalogQueries.activeUntil, now)),
                    or(
                        isNull(catalogQueries.lastRequestedAt),
                        lte(
                            catalogQueries.lastRequestedAt,
                            new Date(now.getTime() - 90 * KEYWORD_DAY_MS)
                        )
                    )
                )
            );
    });
};

export const listScheduledKeywordHeads = async (now = new Date(), limit = 20) =>
    await db
        .select({ id: catalogQueries.id })
        .from(catalogQueries)
        .where(
            and(
                sql`${catalogQueries.tier} <> 'stored'`,
                lte(catalogQueries.nextDueAt, now),
                or(
                    isNull(catalogQueries.nextRefreshAttemptAt),
                    lte(catalogQueries.nextRefreshAttemptAt, now)
                )
            )
        )
        .orderBy(sql`(case ${catalogQueries.tier} when 'hot' then 10 when 'probation' then 4 when 'warm' then 3 else 1 end)
        * (1 + greatest(0, extract(epoch from (${now.toISOString()}::timestamp - ${catalogQueries.nextDueAt}))) / greatest(86400, ${catalogQueries.intervalDays} * 86400)) desc`)
        .limit(limit);

export const resolveScheduledKeywordHead = async ({
    queryId,
    now = new Date(),
}: {
    queryId: string;
    now?: Date;
}) =>
    await db.transaction(async tx => {
        await lockCatalogQueryForReconciliation(tx, queryId);
        const [query] = await tx
            .select()
            .from(catalogQueries)
            .where(eq(catalogQueries.id, queryId));
        if (
            !query ||
            query.tier === 'stored' ||
            !query.nextDueAt ||
            query.nextDueAt > now ||
            (query.nextRefreshAttemptAt && query.nextRefreshAttemptAt > now)
        )
            return { kind: 'notDue' } as const;
        const [pending] = await tx
            .select()
            .from(operations)
            .where(
                and(
                    eq(operations.type, 'catalogSearch'),
                    eq(operations.targetKey, queryId),
                    eq(operations.status, 'pending')
                )
            )
            .limit(1);
        if (pending)
            return {
                kind: 'pending',
                operation: mapOperationRecord(pending),
                created: false,
            } as const;
        const input: CatalogSearchOperationInput = {
            queryId,
            marketplaceId: 'ATVPDKIKX0DER',
            term: query.displayTerm,
            page: 0,
            priority: 'scheduled',
            trigger: 'automatic',
            workClass: query.latestSuccessfulRunAt ? 'head' : 'discovery',
        };
        const [row] = await tx
            .insert(operations)
            .values({ type: 'catalogSearch', targetKey: queryId, input })
            .returning();
        if (!row) throw new Error('Failed to create keyword head operation.');
        await tx
            .update(catalogQueries)
            .set({ lastRefreshAttemptAt: now, updatedAt: now })
            .where(eq(catalogQueries.id, queryId));
        return { kind: 'pending', operation: mapOperationRecord(row), created: true } as const;
    });
