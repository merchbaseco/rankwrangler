const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const SPAPI_CATALOG_SCHEDULER_LAG_MS = HOUR_MS;
export const KEEPA_HISTORY_SCHEDULER_LAG_MS = 3 * HOUR_MS;
export const PRODUCT_HEALTH_OVERDUE_FLOOR = 2;
export const TOP_SEARCH_TERMS_SCHEDULER_LAG_MS = 10 * MINUTE_MS;
export const CATALOG_QUERIES_SCHEDULER_LAG_MS = 15 * MINUTE_MS;

export const SERVICE_HEALTH_CHECKS = [
    'postgres',
    'spapi-catalog',
    'keepa-history',
    'top-search-terms',
    'catalog-queries',
] as const;

export type ServiceHealthCheckName = (typeof SERVICE_HEALTH_CHECKS)[number];

export type ServiceHealthResult =
    | { status: 'ok' }
    | { status: 'degraded'; failing: readonly ServiceHealthCheckName[] };

export type HealthFailingProbe = (now: Date) => Promise<boolean>;

export interface ServiceHealthProbes {
    postgres: () => Promise<void>;
    freshness: Record<Exclude<ServiceHealthCheckName, 'postgres'>, HealthFailingProbe>;
}

export const dueBefore = (now: Date, intervalMs: number, graceMs: number) =>
    new Date(now.getTime() - intervalMs - graceMs);

export const serviceHealthFromFailures = (failures: readonly string[]): ServiceHealthResult => {
    const failing = SERVICE_HEALTH_CHECKS.filter(name => failures.includes(name));
    if (failing.length === 0) {
        return { status: 'ok' };
    }
    return { status: 'degraded', failing };
};

export const readServiceHealth = async (
    probes: ServiceHealthProbes,
    now = new Date()
): Promise<ServiceHealthResult> => {
    try {
        await probes.postgres();
    } catch (error) {
        console.error('[Health] postgres probe failed', error);
        return serviceHealthFromFailures(['postgres']);
    }

    const failures: string[] = [];
    for (const name of SERVICE_HEALTH_CHECKS) {
        if (name === 'postgres') {
            continue;
        }

        try {
            if (await probes.freshness[name](now)) {
                failures.push(name);
            }
        } catch (error) {
            console.error(`[Health] ${name} probe failed`, error);
            const postgresStillUp = await postgresProbeSucceeds(probes.postgres);
            if (!postgresStillUp) {
                return serviceHealthFromFailures(['postgres']);
            }
            failures.push(name);
        }
    }

    return serviceHealthFromFailures(failures);
};

export const readLiveness = async (
    probes: Pick<ServiceHealthProbes, 'postgres'>
): Promise<ServiceHealthResult> => {
    try {
        await probes.postgres();
        return serviceHealthFromFailures([]);
    } catch (error) {
        console.error('[Health] postgres probe failed', error);
        return serviceHealthFromFailures(['postgres']);
    }
};

const postgresProbeSucceeds = async (probe: ServiceHealthProbes['postgres']) => {
    try {
        await probe();
        return true;
    } catch (error) {
        console.error('[Health] postgres probe failed', error);
        return false;
    }
};
