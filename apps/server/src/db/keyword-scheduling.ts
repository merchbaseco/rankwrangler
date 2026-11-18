import { lockKeywordScheduling } from './keyword-scheduling-lock';
import { and, asc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from './index';
import { catalogQueries } from './catalog-search-schema';
import { readScheduledKeywordLoad, scheduledKeyword } from './keyword-scheduled-load';
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
        const load = await readScheduledKeywordLoad(tx, capacity.headCost);
        const allowance = capacity.refillRate * 1440 * 0.2 * 0.9;
        let initialSlots = Math.max(0, 20 - load.unobserved);
        let forecast = load.daily;
        let count = 0;
        // The last clause bounds the read to keywords with recent interest
        // (`catalog_queries_requested_idx`) or a live lease (`..._active_refresh_due_idx`).
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

// Applies, in one statement over the admitted rows, what were four ordered transitions: an
// expired research lease turns cold; a probation that ended without Merch is stored, one with
// Merch turns cold; then anything (including rows just turned cold) with no live lease and no
// interest for 90 days is stored as inactive. Each flag is evaluated on the row as it stands, so a
// concurrent write is re-checked by the update itself.
export const retireKeywordAdmissions = async (now = new Date()) => {
    const at = sql`${now.toISOString()}::timestamp`;
    const q = catalogQueries;
    const noLease = sql`(${q.activeUntil} is null or ${q.activeUntil} <= ${at})`;
    const leaseExpired = sql`(${q.admissionReason} = 'researchLease' and ${q.activeUntil} <= ${at})`;
    const probationOver = sql`(${q.tier} = 'probation' and ${q.probationUntil} <= ${at} and not coalesce(${leaseExpired}, false))`;
    const drop = sql`(${probationOver} and ${q.merchObservedAt} is null and ${noLease})`;
    const demote = sql`(${probationOver} and ${q.merchObservedAt} is not null)`;
    const inactive = sql`(not coalesce(${drop}, false) and ${noLease} and (${q.lastRequestedAt} is null or ${q.lastRequestedAt} <= ${new Date(now.getTime() - 90 * KEYWORD_DAY_MS).toISOString()}::timestamp))`;
    const stored = sql`coalesce(${drop} or ${inactive}, false)`;
    const cold = sql`coalesce(${leaseExpired} or ${demote}, false)`;
    await db.transaction(async tx => {
        await lockKeywordScheduling(tx);
        await tx
            .update(q)
            .set({
                tier: sql`case when ${stored} then 'stored' when ${cold} then 'cold' else ${q.tier} end`,
                intervalDays: sql`case when ${cold} then 30 else ${q.intervalDays} end`,
                nextDueAt: sql`case when ${stored} then null when ${cold} then ${at} else ${q.nextDueAt} end`,
                admissionReason: sql`case when coalesce(${inactive}, false) then 'inactive'
                    when coalesce(${drop}, false) then 'probationExpired'
                    when coalesce(${leaseExpired}, false) then 'leaseExpired'
                    else ${q.admissionReason} end`,
                updatedAt: now,
            })
            .where(and(scheduledKeyword, sql`(${stored} or ${cold})`));
    });
};

export const listScheduledKeywordHeads = async (now = new Date(), limit = 20) =>
    await db
        .select({ id: catalogQueries.id })
        .from(catalogQueries)
        .where(
            and(
                scheduledKeyword,
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
