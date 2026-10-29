import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { providerAttempts } from '@/db/provider-telemetry-schema';
import {
    PROVIDER_HEALTH_MIN_CALLS,
    PROVIDER_HEALTH_WINDOW_MS,
    type ProviderHealthCheckName,
    readLiveness,
    readServiceHealth,
    type ServiceHealthProbes,
} from '@/services/service-health';

const probePostgres = async () => {
    await db.execute(sql`SELECT 1`);
};

/**
 * True when the provider is unreachable: at least `PROVIDER_HEALTH_MIN_CALLS` calls in the window
 * and not one answered. A 429 is an answer (out of tokens or throttled), so it never counts.
 */
export const probeProviderDown = (provider: ProviderHealthCheckName) => async (now: Date) => {
    const [row] = await db
        .select({
            calls: sql<number>`count(*)::int`,
            answered: sql<number>`count(*) filter (where not ${providerAttempts.isError} or ${providerAttempts.statusCode} = 429)::int`,
        })
        .from(providerAttempts)
        .where(
            and(
                eq(providerAttempts.provider, provider),
                gt(
                    providerAttempts.attemptedAt,
                    new Date(now.getTime() - PROVIDER_HEALTH_WINDOW_MS)
                )
            )
        );
    return (row?.calls ?? 0) >= PROVIDER_HEALTH_MIN_CALLS && (row?.answered ?? 0) === 0;
};

export const createDatabaseHealthReaders = () => ({
    readLiveness: () => readLiveness({ postgres: probePostgres }),
    readServiceHealth: () => readServiceHealth(databaseHealthProbes),
});

const databaseHealthProbes: ServiceHealthProbes = {
    postgres: probePostgres,
    providers: {
        keepa: probeProviderDown('keepa'),
        spapi: probeProviderDown('spapi'),
    },
};
