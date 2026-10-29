import { and, eq, isNull, sql } from 'drizzle-orm';
import {
    estimateKeepaTokens,
    getKeepaReservation,
} from '@/services/providers/keepa/keepa-capacity-policy';
import {
    type KeepaCapacity,
    KeepaCapacityDeferredError,
    type KeepaWorkClass,
} from '@/services/providers/keepa/keepa-capacity-types';
import type { KeepaUsageSource } from '@/services/providers/keepa/keepa-provider-types';
import { db } from './index';
import { keepaCapacityAttempts, keepaCapacityState } from './keepa-capacity-schema';
import { readKeepaDueWork } from './keepa-due-work';

const LOCK = sql`select pg_advisory_xact_lock(728194402)`;
export const readKeepaMeasuredCosts = async (database: Pick<typeof db, 'execute'> = db) => {
    const rows = await database.execute<{ operation: string; cost: number }>(sql`
        with measurements as (
            select case when request_params->>'kind' = 'catalogSearch' then 'search' else 'product' end as operation,
                tokens_consumed as cost
            from product_history_imports where source = 'keepa' and tokens_consumed > 0
            union all
            select operation, actual_tokens as cost from keepa_capacity_attempts
            where actual_tokens > 0 and operation in ('product', 'search')
        ) select operation, percentile_disc(0.95) within group (order by cost)::integer as cost
        from measurements group by operation
    `);
    return {
        productCost: rows.find(row => row.operation === 'product')?.cost ?? null,
        headCost: rows.find(row => row.operation === 'search')?.cost ?? null,
    };
};

export const persistedKeepaCapacity: KeepaCapacity = {
    enqueue: async request => {
        const [attempt] = await db
            .insert(keepaCapacityAttempts)
            .values({ ...request, createdAt: new Date() })
            .returning({ id: keepaCapacityAttempts.id });
        return attempt.id;
    },
    cancel: async id => {
        await db
            .update(keepaCapacityAttempts)
            .set({ settledAt: new Date() })
            .where(
                and(
                    eq(keepaCapacityAttempts.id, id),
                    isNull(keepaCapacityAttempts.reservedAt),
                    isNull(keepaCapacityAttempts.settledAt)
                )
            );
    },
    reserve: async id => {
        let workClass = null as KeepaWorkClass | null;
        const deferred = await db.transaction(async tx => {
            await tx.execute(LOCK);
            const [attempt] = await tx
                .select()
                .from(keepaCapacityAttempts)
                .where(eq(keepaCapacityAttempts.id, id));
            if (!attempt || attempt.reservedAt || attempt.settledAt) {
                throw new Error('Invalid Keepa reservation transition');
            }
            workClass = attempt.workClass;
            const now = new Date();
            const [state] = await tx
                .select()
                .from(keepaCapacityState)
                .where(eq(keepaCapacityState.id, 1));
            if (attempt.operation === 'token') {
                await tx
                    .update(keepaCapacityAttempts)
                    .set({ reservedTokens: 0, reservedAt: now })
                    .where(eq(keepaCapacityAttempts.id, id));
                return null;
            }
            if (!state || now.getTime() - state.observedAt.getTime() > 120_000) {
                return 'stale-bucket';
            }
            if (attempt.workClass === 'discovery' && !attempt.keywordId) {
                return 'missing-keyword-identity';
            }
            const costs = await readKeepaMeasuredCosts(tx);
            const [totals] = await tx.execute<{
                interactive: number;
                history: number;
                head: number;
                discovery: number;
                reserved: number;
                heads: number;
                discoveries: number;
                keyword_discoveries: number;
                interactive_operation_attempts: number;
            }>(sql`
                select
                    coalesce(sum(coalesce(actual_tokens, reserved_tokens)) filter (where work_class='interactive' and reserved_at > timezone('UTC',now())-interval '60 minutes'),0)::float8 interactive,
                    coalesce(sum(coalesce(actual_tokens, reserved_tokens)) filter (where work_class='history' and reserved_at > timezone('UTC',now())-interval '60 minutes'),0)::float8 history,
                    coalesce(sum(coalesce(actual_tokens, reserved_tokens)) filter (where work_class='head' and reserved_at > timezone('UTC',now())-interval '60 minutes'),0)::float8 head,
                    coalesce(sum(coalesce(actual_tokens, reserved_tokens)) filter (where work_class='discovery' and reserved_at > timezone('UTC',now())-interval '60 minutes'),0)::float8 discovery,
                    coalesce(sum(reserved_tokens) filter (where reserved_at > timezone('UTC',now())-interval '60 minutes' and actual_tokens is null),0)::float8 reserved,
                    count(*) filter (where work_class='head' and reserved_at > timezone('UTC',now())-interval '24 hours')::integer heads,
                    count(*) filter (where work_class='discovery' and reserved_at > timezone('UTC',now())-interval '24 hours')::integer discoveries,
                    count(*) filter (where work_class='discovery' and keyword_id=${attempt.keywordId} and reserved_at > timezone('UTC',now())-interval '24 hours')::integer keyword_discoveries,
                    count(*) filter (where operation=${attempt.operation} and work_class='interactive' and reserved_at > timezone('UTC',now())-interval '24 hours')::integer interactive_operation_attempts
                from keepa_capacity_attempts where reserved_at > timezone('UTC',now())-interval '24 hours'
                    
            `);
            const unmeasured =
                { product: costs.productCost, search: costs.headCost, category: null }[
                    attempt.operation
                ] === null;
            if (unmeasured && totals.interactive_operation_attempts >= 10) {
                return 'unknown-pilot-cap';
            }
            const decision = getKeepaReservation(attempt, {
                ...costs,
                ...(await readKeepaDueWork(tx)),
                tokensLeft: estimateKeepaTokens(state, now),
                refillRate: state.refillRate,
                reservedCost: totals.reserved,
                spent: {
                    interactive: totals.interactive,
                    history: totals.history,
                    head: totals.head,
                    discovery: totals.discovery,
                },
                headRequests: totals.heads,
                discoveryRequests: totals.discoveries,
                keywordDiscoveryRequests: totals.keyword_discoveries,
            });
            if (decision.reason) {
                return decision.reason;
            }
            await tx
                .update(keepaCapacityAttempts)
                .set({ reservedTokens: decision.cost, reservedAt: now })
                .where(eq(keepaCapacityAttempts.id, id));
            return null;
        });
        // An interactive attempt short on tokens stays open, so background work keeps yielding while
        // its caller retries; the provider cancels it if it gives up.
        if (deferred === 'bucket' && workClass === 'interactive') {
            throw new KeepaCapacityDeferredError(deferred, new Date(Date.now() + 5_000));
        }
        if (deferred) {
            await db
                .update(keepaCapacityAttempts)
                .set({ settledAt: new Date() })
                .where(eq(keepaCapacityAttempts.id, id));
            throw new KeepaCapacityDeferredError(deferred, new Date(Date.now() + 60_000));
        }
    },
    settle: async (id, usage) => {
        await db.transaction(async tx => {
            await tx.execute(LOCK);
            const [attempt] = await tx
                .select()
                .from(keepaCapacityAttempts)
                .where(eq(keepaCapacityAttempts.id, id));
            if (!attempt?.reservedAt || attempt.settledAt) {
                throw new Error('Invalid Keepa settlement transition');
            }
            const now = new Date();
            const actualTokens =
                finiteNonnegative(usage?.tokensConsumed) ??
                (attempt.operation === 'token' ? 0 : null);
            await tx
                .update(keepaCapacityAttempts)
                .set({
                    actualTokens,
                    refillRate: finiteNonnegative(usage?.refillRate),
                    settledAt: now,
                })
                .where(eq(keepaCapacityAttempts.id, id));
            await recordBucket(tx, usage, now);
        });
    },
};

const recordBucket = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    usage: KeepaUsageSource | null,
    now: Date
) => {
    const tokensLeft = finiteNonnegative(usage?.tokensLeft);
    const refillRate = finiteNonnegative(usage?.refillRate);
    const refillInMs = finiteNonnegative(usage?.refillIn);
    if (tokensLeft === null || refillRate === null || refillRate <= 0 || refillInMs === null) {
        return;
    }
    const [old] = await tx.select().from(keepaCapacityState).where(eq(keepaCapacityState.id, 1));
    const values = {
        id: 1,
        tokensLeft: Math.min(
            tokensLeft,
            refillRate * 60,
            old ? estimateKeepaTokens(old, now) : Number.POSITIVE_INFINITY
        ),
        refillRate,
        refillInMs,
        observedAt: now,
    };
    await tx
        .insert(keepaCapacityState)
        .values(values)
        .onConflictDoUpdate({ target: keepaCapacityState.id, set: values });
};

const finiteNonnegative = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
