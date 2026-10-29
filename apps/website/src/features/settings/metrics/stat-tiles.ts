import { outcomeOfStat, withTimeDomainLabel } from './job-run-filters';
import type { MetricTile } from './metric-kpi-group';

interface StatSeries {
    readonly buckets: readonly number[];
    readonly format?: 'count' | 'usd';
    readonly label: string;
    readonly total: number;
}

/** A server stat series as a tile: total, sparkline, and the tone its label implies. */
const outcomeTone = { all: 'neutral', failed: 'danger', success: 'success' } as const;

export const statTile = (stat: StatSeries, timeDomainLabel?: string, help?: string): MetricTile => {
    const outcome = outcomeOfStat(stat.label);
    return {
        buckets: stat.buckets,
        format: stat.format,
        help,
        label: withTimeDomainLabel(stat.label, timeDomainLabel),
        tone: outcomeTone[outcome],
        value: stat.total,
    };
};
