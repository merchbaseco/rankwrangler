import type { RouterOutputs } from '@/lib/trpc';

export type SystemStatus = RouterOutputs['api']['app']['system']['status'];
export type RefreshTiers = RouterOutputs['api']['app']['system']['refreshTiers'];
export type RefreshTier = RefreshTiers['keepa'][number] | RefreshTiers['spApi'][number];
type HealthCheck = Extract<SystemStatus['health'], { status: 'degraded' }>['failing'][number];
export type Provider = Exclude<HealthCheck, 'postgres'>;

/** Overall state: ok when every health check passes, attention when any fails. */
export type SystemTone = 'ok' | 'attention' | 'unknown';

export const systemTone = (status: SystemStatus | undefined): SystemTone => {
    if (!status) {
        return 'unknown';
    }
    return status.health.status === 'ok' ? 'ok' : 'attention';
};

export const healthCheckLabels: Readonly<Record<HealthCheck, string>> = {
    keepa: 'Keepa',
    postgres: 'Database',
    spapi: 'SP-API',
};

/** The checks `/api/health` reports failing, empty while it is ok. */
export const failingChecks = (status: SystemStatus): readonly HealthCheck[] =>
    status.health.status === 'degraded' ? status.health.failing : [];

/**
 * A provider's last day at a glance. Throttles (429) are judged apart from other errors: a
 * provider that throttles more than 1% of its calls is hitting its limit too often, and one that
 * fails more than 5% is failing. Unreachable wins over both.
 */
export type ProviderVerdict = 'healthy' | 'throttled' | 'failing' | 'unreachable';

export interface ProviderTotals {
    readonly calls24h: number;
    readonly errors24h: number;
    readonly throttled24h: number;
}

export const providerTotals = (status: SystemStatus, provider: Provider): ProviderTotals =>
    status.calls
        .filter(row => row.provider === provider)
        .reduce(
            (sum, row) => ({
                calls24h: sum.calls24h + row.calls24h,
                errors24h: sum.errors24h + row.errors24h,
                throttled24h: sum.throttled24h + row.throttled24h,
            }),
            { calls24h: 0, errors24h: 0, throttled24h: 0 }
        );

export const providerVerdict = (status: SystemStatus, provider: Provider): ProviderVerdict => {
    if (failingChecks(status).includes(provider)) {
        return 'unreachable';
    }
    const totals = providerTotals(status, provider);
    if (fraction(totals.errors24h, totals.calls24h) > failingShare) {
        return 'failing';
    }
    const throttled = fraction(totals.throttled24h, totals.calls24h) > throttledShare;
    return throttled ? 'throttled' : 'healthy';
};

export interface OperationUsage {
    readonly operation: string;
    readonly label: string;
    readonly calls1h: number;
    readonly hourlyLimit: number | null;
}

/**
 * Each SP-API operation's last hour against its own rate limit, every limited operation first
 * (even idle ones, so the limits stay visible), then any unlimited operation that made calls.
 */
export const spApiOperationUsage = (status: SystemStatus): OperationUsage[] => {
    const calls = new Map(
        status.calls.filter(row => row.provider === 'spapi').map(row => [row.operation, row])
    );
    const limited = status.spApiLimits.map(limit => ({
        operation: limit.operation,
        label: operationLabel(limit.operation),
        calls1h: calls.get(limit.operation)?.calls1h ?? 0,
        hourlyLimit: limit.hourlyLimit,
    }));
    const unlimited = [...calls.values()]
        .filter(row => row.calls1h > 0 && !limited.some(item => item.operation === row.operation))
        .map(row => ({
            operation: row.operation,
            label: operationLabel(row.operation),
            calls1h: row.calls1h,
            hourlyLimit: null,
        }));
    return [...limited, ...unlimited];
};

/** A share of a whole, clamped to 0–1; an unknown or empty whole is 0. */
export const fraction = (part: number, whole: number | null) =>
    whole && whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;

/** "0.4%", "12%": one decimal below ten percent, where small rates matter. */
export const formatPercent = (value: number) => {
    const percent = value * 100;
    if (percent > 0 && percent < 0.1) {
        return '<0.1%';
    }
    return percent < 10 ? `${Number(percent.toFixed(1))}%` : `${Math.round(percent)}%`;
};

export const formatCount = (value: number) => countFormatter.format(value);

/** Keepa work classes as the dashboard names them. */
export const keepaWorkLabels: Readonly<Record<string, string>> = {
    discovery: 'Discovery',
    head: 'Keyword checks',
    history: 'Sales history',
    interactive: 'Live lookups',
};

/** A provider operation as people read it: `spapi.catalog.search` becomes "Catalog search". */
export const operationLabel = (operation: string) => {
    const named = operationNames[operation];
    if (named) {
        return named;
    }
    const words = operation.split('.').slice(1).join(' ').replace(/[-_]/g, ' ').trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : operation;
};

const failingShare = 0.05;
const throttledShare = 0.01;

const operationNames: Readonly<Record<string, string>> = {
    'spapi.reports.create': 'Report requests',
    'spapi.reports.download': 'Report downloads',
    'spapi.reports.get': 'Report polls',
    'spapi.reports.getDocument': 'Report links',
};

const countFormatter = new Intl.NumberFormat('en-US');
