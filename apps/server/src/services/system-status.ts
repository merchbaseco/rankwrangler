import { readKeepaCapacitySnapshot } from '@/db/keepa-capacity-snapshot';
import { readProductIndex, readProviderCalls, readSystemPipelines } from '@/db/system-status';
import { createDatabaseHealthReaders } from '@/services/service-health-queries';

const healthReaders = createDatabaseHealthReaders();

/**
 * The admin system status: `/api/health`'s verdict, each pipeline's schedule, the Product index,
 * the Keepa token allowance and each provider's calls. One read for the banner indicator and the
 * top of System Status.
 */
export const getSystemStatus = async (now = new Date()) => {
    const [health, pipelines, products, keepa, calls] = await Promise.all([
        healthReaders.readServiceHealth(),
        readSystemPipelines(now),
        readProductIndex(now),
        readKeepaCapacitySnapshot(),
        readProviderCalls(now),
    ]);
    return {
        observedAt: now.toISOString(),
        health,
        pipelines,
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
    };
};
