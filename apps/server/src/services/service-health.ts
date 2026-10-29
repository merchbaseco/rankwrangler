const MINUTE_MS = 60 * 1000;

// A provider is down only when it answered nothing but errors across at least this many calls
// in the window. A quiet provider is not down, and a backlog is not an outage.
export const PROVIDER_HEALTH_WINDOW_MS = 15 * MINUTE_MS;
export const PROVIDER_HEALTH_MIN_CALLS = 3;

export const SERVICE_HEALTH_CHECKS = ['postgres', 'keepa', 'spapi'] as const;

export type ServiceHealthCheckName = (typeof SERVICE_HEALTH_CHECKS)[number];
export type ProviderHealthCheckName = Exclude<ServiceHealthCheckName, 'postgres'>;

export type ServiceHealthResult =
    | { status: 'ok' }
    | { status: 'degraded'; failing: readonly ServiceHealthCheckName[] };

export type HealthFailingProbe = (now: Date) => Promise<boolean>;

export interface ServiceHealthProbes {
    postgres: () => Promise<void>;
    providers: Record<ProviderHealthCheckName, HealthFailingProbe>;
}

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
            if (await probes.providers[name](now)) {
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
