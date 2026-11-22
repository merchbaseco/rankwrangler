import { readKeepaCapacitySnapshot } from '@/db/keepa-capacity-snapshot';
import { type ProductStats, readProductStats } from '@/db/product-stats';
import { isAutocompleteRelayConfigured } from '@/services/keyword-autocomplete-provider';
import { getHistoryAdmissionForecast } from '@/services/product-history-admission';
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
        products: stats ? buildProductIndex(stats) : null,
        autocomplete: {
            configured: isAutocompleteRelayConfigured(),
        },
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
            dailyPlanLoad: stats
                ? computeKeepaDailyPlanLoad(stats, keepa.refillRate, keepa.productCost)
                : null,
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
 * How much of the catalog is indexed, its active Merch breakdown (auto-tracked `<1M`, on-demand
 * `≥1M`, and listings with no BSR), and sales-history coverage within the `<1M` auto-tracked set.
 */
export const buildProductIndex = (stats: ProductStats) => {
    const tracked = totalKeepaTracked(stats);
    const waiting = totalKeepaWaiting(stats);
    const autoTracked = tracked + waiting;
    const outsideAuto = Math.max(0, stats.merch - autoTracked);
    const noBsr = Math.min(outsideAuto, stats.merchMissingBsr);
    const onDemand = Math.max(0, outsideAuto - noBsr);
    return {
        total: stats.products,
        merch: stats.merch,
        new24h: stats.new24h,
        breakdown: {
            autoTracked,
            onDemand,
            noBsr,
        },
        history: {
            withHistory: stats.merchWithHistory,
            autoSynced: Math.max(0, tracked - stats.merchAwaitingFirst),
            awaitingFirst: stats.merchAwaitingFirst,
            awaitingAdmission: waiting,
            notTracked: stats.merchNotTracked,
        },
    };
};

/** Standing daily refresh spend across enrolled `<1M` tiers as a share of total daily refill. */
export const computeKeepaDailyPlanLoad = (
    stats: ProductStats,
    refillRate: number | null,
    productCost: number | null
) => {
    if (refillRate === null || refillRate <= 0 || productCost === null || productCost <= 0) {
        return null;
    }
    const { projectedDailyTokens } = getHistoryAdmissionForecast({
        twiceDaily: stats.historyTwiceDaily,
        daily: stats.historyDaily,
        weekly: stats.historyWeekly,
        biweekly: stats.historyBiweekly,
        productCost,
        refillRate,
    });
    const dailyTokens = refillRate * 60 * 24;
    return {
        projectedDailyTokens: Math.round(projectedDailyTokens),
        dailyTokens: Math.round(dailyTokens),
        share: projectedDailyTokens / dailyTokens,
    };
};

const totalKeepaTracked = (stats: ProductStats) =>
    stats.historyTwiceDaily + stats.historyDaily + stats.historyWeekly + stats.historyBiweekly;

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
