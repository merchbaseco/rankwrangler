import { readKeepaCapacitySnapshot } from '@/db/keepa-capacity-snapshot';
import { readProductIndex, readProviderCalls } from '@/db/system-status';
import { mapTelemetryOperation } from '@/services/providers/sp-api/sp-api-limiter-manager';
import { createSpApiProvider } from '@/services/providers/sp-api/sp-api-provider';
import { createDatabaseHealthReaders } from '@/services/service-health-queries';

const healthReaders = createDatabaseHealthReaders();

/**
 * The admin system status: `/api/health`'s verdict, the Product index, the Keepa token
 * allowance, each provider's calls, and each SP-API operation's hourly rate limit. One read for
 * the banner indicator and the top of System Status.
 */
export const getSystemStatus = async (now = new Date()) => {
    const [health, products, keepa, calls, limiters] = await Promise.all([
        healthReaders.readServiceHealth(),
        readProductIndex(now),
        readKeepaCapacitySnapshot(),
        readProviderCalls(now),
        createSpApiProvider().getOperationRateLimiterStats(),
    ]);
    return {
        observedAt: now.toISOString(),
        health,
        products,
        calls,
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
        },
        // Each operation's configured rate over an hour: the ceiling its calls are measured on.
        spApiLimits: limiters.map(limiter => ({
            operation: mapTelemetryOperation(limiter.operationId),
            hourlyLimit: Math.round(limiter.configuredRps * 3600),
        })),
    };
};
