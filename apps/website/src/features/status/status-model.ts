import type { RouterOutputs } from '@/lib/trpc';

export type SystemStatus = RouterOutputs['api']['app']['system']['status'];
export type SystemPipeline = SystemStatus['pipelines'][number];

/** Overall state: ok when every health check passes, attention when any fails. */
export type SystemTone = 'ok' | 'attention' | 'unknown';

export const systemTone = (status: SystemStatus | undefined): SystemTone => {
    if (!status) {
        return 'unknown';
    }
    return status.health.status === 'ok' ? 'ok' : 'attention';
};

/** What each pipeline keeps current, named for the data rather than the provider call. */
export const pipelineLabels: Readonly<Record<SystemPipeline['pipeline'], string>> = {
    'catalog-queries': 'Catalog queries',
    'keepa-history': 'Sales history',
    'spapi-catalog': 'Product refresh',
};

export const pipelineSources: Readonly<Record<SystemPipeline['pipeline'], string>> = {
    'catalog-queries': 'Keepa',
    'keepa-history': 'Keepa',
    'spapi-catalog': 'SP-API',
};

export const isPipelineFailing = (status: SystemStatus, pipeline: SystemPipeline['pipeline']) =>
    status.health.status === 'degraded' && status.health.failing.includes(pipeline);

/** "12m ago", "in 3h", "now": the relative form schedules use. Null reads as an em dash. */
export const formatRelative = (iso: string | null, now = Date.now()) => {
    if (!iso) {
        return '—';
    }
    const deltaMs = Date.parse(iso) - now;
    const minutes = Math.round(Math.abs(deltaMs) / 60_000);
    if (minutes < 1) {
        return 'now';
    }
    const amount =
        minutes < 60
            ? `${minutes}m`
            : minutes < 48 * 60
              ? `${Math.round(minutes / 60)}h`
              : `${Math.round(minutes / 1440)}d`;
    return deltaMs < 0 ? `${amount} ago` : `in ${amount}`;
};

/** A share of a whole, clamped to 0–1; an unknown or empty whole is 0. */
export const fraction = (part: number, whole: number | null) =>
    whole && whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;

export const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

/** Keepa work classes as the dashboard names them. */
export const keepaWorkLabels: Readonly<Record<string, string>> = {
    discovery: 'Discovery',
    head: 'Keyword checks',
    history: 'Sales history',
    interactive: 'Live lookups',
};

/** A provider operation as people read it: `spapi.catalog.search` becomes "Catalog search". */
export const operationLabel = (operation: string) => {
    const words = operation.split('.').slice(1).join(' ').replace(/[-_]/g, ' ').trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : operation;
};
