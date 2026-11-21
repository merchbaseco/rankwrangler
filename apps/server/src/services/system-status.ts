import { readKeepaCapacitySnapshot } from '@/db/keepa-capacity-snapshot';
import { type ProductStats, readProductStats } from '@/db/product-stats';
import { getHistoryAdmissionOverload } from '@/services/product-history-overload';
import { mapTelemetryOperation } from '@/services/providers/sp-api/sp-api-limiter-manager';
import { createSpApiProvider } from '@/services/providers/sp-api/sp-api-provider';
import { createDatabaseHealthReaders } from '@/services/service-health-queries';

const healthReaders = createDatabaseHealthReaders();

/**
 * The admin system status: `/api/health`'s verdict, the Product index, the Keepa token
 * allowance, each provider's calls, and each SP-API operation's hourly rate limit. One read for
 * the banner indicator and the top of System Status. Product and provider-call counts come from
 * the stored snapshot (`countedAt`); before its first pass `products` is null and `calls` empty.
 */
export const getSystemStatus = async (now = new Date()) => {
    const [health, stats, keepa, limiters] = await Promise.all([
        healthReaders.readServiceHealth(),
        readProductStats(),
        readKeepaCapacitySnapshot(),
        createSpApiProvider().getOperationRateLimiterStats(),
    ]);
    return {
        observedAt: now.toISOString(),
        countedAt: stats?.observedAt.toISOString() ?? null,
        health,
        products: stats ? productIndex(stats) : null,
        calls: stats?.providerCalls ?? [],
        keepa: {
            tokensLeft: keepa.estimatedTokensLeft,
            // Keepa drops tokens older than an hour, so the bucket holds an hour of refill.
            capacity: keepa.refillRate === null ? null : keepa.refillRate * 60,
            refillRate: keepa.refillRate,
            liveReserveTokens: keepa.liveReserveTokens,
            observed: keepa.fresh,
            spentLastHour: keepa.rollingHour.map(row => ({
                workClass: row.workClass,
                tokens: row.actualTokens + row.reservedUnknownTokens,
            })),
            admission: stats ? keepaAdmissionStatus(stats, now) : null,
        },
        // Each operation's configured rate over an hour: the ceiling its calls are measured on.
        spApiLimits: limiters.map(limiter => ({
            operation: mapTelemetryOperation(limiter.operationId),
            hourlyLimit: Math.round(limiter.configuredRps * 3600),
        })),
    };
};

/**
 * How much of the catalog is indexed, and the sales-history sync status of the active Merch
 * listings. Every Merch listing sits in exactly one of: `withHistory` (Keepa history imported),
 * `awaitingFirst` (admitted inside the automatic Keepa tiers, first import still queued),
 * `awaitingAdmission` (under 1M BSR and waiting/paused for Keepa admission) or `notTracked`
 * (no history and outside the automatic tiers, so Keepa only syncs it on demand).
 */
const productIndex = (stats: ProductStats) => ({
    total: stats.products,
    merch: stats.merch,
    new24h: stats.new24h,
    history: {
        withHistory: stats.merchWithHistory,
        awaitingFirst: stats.merchAwaitingFirst,
        awaitingAdmission: totalKeepaWaiting(stats),
        notTracked: stats.merchNotTracked,
    },
});

const totalKeepaWaiting = (stats: ProductStats) =>
    stats.keepaWaitingDaily + stats.keepaWaitingWeekly + stats.keepaWaitingBiweekly;

const keepaAdmissionStatus = (stats: ProductStats, now: Date) => {
    const waiting = totalKeepaWaiting(stats);
    const overload = getHistoryAdmissionOverload(stats, now);
    const state: 'open' | 'capacity' | 'paused' = overload.newAdmissionsPaused
        ? 'paused'
        : waiting > 0
          ? 'capacity'
          : 'open';
    return {
        state,
        waiting,
        overdue: overload.overdueCount,
        oldestOverdueAt: overload.oldestOverdueAt?.toISOString() ?? null,
    };
};
