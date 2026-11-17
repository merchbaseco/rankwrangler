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
import { readKeepaReservationFacts } from './keepa-capacity-facts';
import { recordKeepaMeasuredCost } from './keepa-measured-costs';

const LOCK = sql`select pg_advisory_xact_lock(728194402)`;

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
            const [row] = await tx
                .select({ attempt: keepaCapacityAttempts, state: keepaCapacityState })
                .from(keepaCapacityAttempts)
                .leftJoin(keepaCapacityState, eq(keepaCapacityState.id, 1))
                .where(eq(keepaCapacityAttempts.id, id));
            const attempt = row?.attempt;
            if (!attempt || attempt.reservedAt || attempt.settledAt) {
                throw new Error('Invalid Keepa reservation transition');
            }
            workClass = attempt.workClass;
            const now = new Date();
            const state = row.state;
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
            const facts = await readKeepaReservationFacts(tx, attempt);
            const unmeasured =
                { product: facts.productCost, search: facts.headCost, category: null }[
                    attempt.operation
                ] === null;
            if (unmeasured && facts.interactiveOperationAttempts >= 10) {
                return 'unknown-pilot-cap';
            }
            const decision = getKeepaReservation(attempt, {
                productCost: facts.productCost,
                headCost: facts.headCost,
                interactiveWaiting: facts.interactiveWaiting,
                tokensLeft: estimateKeepaTokens(state, now),
                reservedCost: facts.reservedCost,
                reserveTokens: state.liveReserveTokens,
                headRequests: facts.headRequests,
                discoveryRequests: facts.discoveryRequests,
                keywordDiscoveryRequests: facts.keywordDiscoveryRequests,
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
            if (
                actualTokens !== null &&
                actualTokens > 0 &&
                (attempt.operation === 'product' || attempt.operation === 'search')
            ) {
                await recordKeepaMeasuredCost(tx, {
                    operation: attempt.operation,
                    cost: Math.ceil(actualTokens / attempt.itemCount),
                    now,
                });
            }
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
