import { useMemo, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import {
    type AdminStatLabel,
    type JobStatusFilter,
    STAT_FILTER_CONFIG,
    isStatFilterLabel,
} from '@/components/dashboard/admin-operations-panel-config';
import {
    formatDateTime,
    formatDuration,
} from '@/components/dashboard/job-executions-panel/formatters';
import { KeepaRefreshPolicyPanel } from '@/components/dashboard/keepa-refresh-policy-panel';
import { withTimeDomainLabel } from '@/components/dashboard/metrics-time-domain-label';
import { api } from '@/lib/trpc';
import { cn, formatNumber } from '@/lib/utils';

const COLS = 3;
const SETTINGS_METRICS_POLL_INTERVAL_MS = 10_000;
const KEEPA_STAT_LABELS = new Set<AdminStatLabel>([
    'Keepa Fetches',
    'Job Successes',
    'Job Failures',
]);
const KEEPA_METRIC_TOOLTIPS: Record<AdminStatLabel, string> = {
    'Keepa Fetches': 'Number of Keepa API call attempts (from keepa import rows).',
    'Job Successes':
        'Completed Keepa fetch or scheduled enqueue jobs with a success status.',
    'Job Failures':
        'Keepa fetch or scheduled enqueue jobs that ended with a failed status.',
    'SP-API Jobs Run': '',
    'SP-API Jobs Success': '',
    'SP-API Jobs Failed': '',
};
const MINI_STAT_TOOLTIPS: Record<MiniStatLabel, string> = {
    Queued: 'Current number of ASINs waiting in the Keepa refresh queue.',
    'Auto Refresh': 'Merch products currently eligible for automatic Keepa refresh.',
    'Merch Products': 'Total unique merch products in the products table.',
    'With Keepa': 'Unique merch products with at least one successful Keepa import.',
    'Without Keepa': 'Unique merch products that have never had a successful Keepa import.',
};

type StatType = 'neutral' | 'success' | 'error';

const STAT_STYLES: Record<StatType, { color: string; stroke: string }> = {
    neutral: { color: 'text-foreground', stroke: 'var(--color-foreground)' },
    success: { color: 'text-success-foreground', stroke: 'var(--color-success)' },
    error: { color: 'text-destructive', stroke: 'var(--color-destructive)' },
};

const getStatType = (label: string): StatType => {
    if (label.includes('Success')) return 'success';
    if (
        label.includes('Error') ||
        label.includes('Fail')
    ) return 'error';
    return 'neutral';
};

export const KeepaMetricsPanel = () => {
    const [selectedStat, setSelectedStat] = useState<AdminStatLabel | null>(null);

    const statsQuery = api.api.app.getAdminStats.useQuery(undefined, {
        refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
    });
    const keepaStatusQuery = api.api.app.getKeepaStatus.useQuery(undefined, {
        refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        retry: false,
    });

    const allStats = statsQuery.data?.stats ?? [];
    const stats = allStats.filter(
        (s): s is (typeof allStats)[number] & { label: AdminStatLabel } =>
            isStatFilterLabel(s.label) && KEEPA_STAT_LABELS.has(s.label)
    );
    const keepaRefreshPolicyBuckets = statsQuery.data?.keepaRefreshPolicyBuckets ?? [];
    const keepaFetchGuardLabel = statsQuery.data?.keepaFetchGuardLabel ?? '';
    const timeDomainLabel = statsQuery.data?.timeDomainLabel;
    const keepaMerchCoverage = statsQuery.data?.keepaMerchCoverage ?? {
        totalMerchProducts: 0,
        merchProductsWithKeepaData: 0,
        merchProductsWithoutKeepaData: 0,
    };
    const keepaQueueLength = keepaStatusQuery.data?.queue.totalQueued ?? null;
    const autoRefreshProducts = keepaRefreshPolicyBuckets
        .filter((bucket) => bucket.isAutoRefresh)
        .reduce((total, bucket) => total + bucket.count, 0);
    const isLoading = statsQuery.isLoading;

    const defaultSelectedStat = stats
        .map((stat) => stat.label)
        .find((label): label is AdminStatLabel => isStatFilterLabel(label));

    const effectiveSelectedStat = selectedStat ?? defaultSelectedStat ?? null;
    const selectedConfig =
        effectiveSelectedStat === null ? undefined : STAT_FILTER_CONFIG[effectiveSelectedStat];

    const queryInput = useMemo(() => {
        if (selectedConfig === undefined) return undefined;
        const input: { limit: number; status?: JobStatusFilter; jobNames?: string[] } = {
            limit: 100,
        };
        if (selectedConfig.status !== undefined) input.status = selectedConfig.status;
        if (selectedConfig.jobNames !== undefined) input.jobNames = [...selectedConfig.jobNames];
        return input;
    }, [selectedConfig]);

    const jobQuery = api.api.app.jobExecutions.useQuery(queryInput, {
        enabled: selectedConfig !== undefined,
        retry: false,
        refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
    });

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading Keepa metrics…</p>
            </div>
        );
    }

    const jobs = jobQuery.data;

    return (
        <div className="flex h-full flex-col">
            {/* Stat tiles — single row of 3 */}
            <div className="grid grid-cols-3">
                {stats.map((stat, i) => {
                    const statType = getStatType(stat.label);
                    const style = STAT_STYLES[statType];
                    const hasDetailView = isStatFilterLabel(stat.label);
                    const isSelected = effectiveSelectedStat === stat.label;

                    return (
                        <button
                            key={stat.label}
                            type="button"
                            disabled={!hasDetailView}
                            onClick={() => {
                                if (!hasDetailView) return;
                                if (effectiveSelectedStat === stat.label) {
                                    void Promise.all([
                                        jobQuery.refetch(),
                                        statsQuery.refetch(),
                                    ]);
                                    return;
                                }
                                void statsQuery.refetch();
                                setSelectedStat(stat.label);
                            }}
                            className={cn(
                                'flex flex-col justify-between p-3 text-left transition-colors',
                                i < COLS - 1 && 'border-r border-border',
                                hasDetailView && 'cursor-pointer hover:bg-accent',
                                !hasDetailView && 'cursor-default disabled:opacity-100',
                                isSelected && 'bg-accent',
                            )}
                        >
                            <MetricLabel
                                label={withTimeDomainLabel(stat.label, timeDomainLabel)}
                                tooltip={KEEPA_METRIC_TOOLTIPS[stat.label]}
                            />
                            <p
                                className={cn(
                                    'stat-value font-mono text-2xl font-bold',
                                    style.color,
                                )}
                            >
                                {formatNumber(stat.total)}
                            </p>
                            <Sparkline
                                buckets={stat.buckets}
                                stroke={style.stroke}
                                id={stat.label}
                            />
                        </button>
                    );
                })}
            </div>

            {/* Merch coverage stats — mirrors the stat tile grid above */}
            <div className="grid grid-cols-5 border-t border-border">
                <MiniStat
                    label="Queued"
                    tooltip={MINI_STAT_TOOLTIPS.Queued}
                    value={
                        keepaQueueLength === null
                            ? '—'
                            : formatNumber(keepaQueueLength)
                    }
                />
                <MiniStat
                    label="Auto Refresh"
                    tooltip={MINI_STAT_TOOLTIPS['Auto Refresh']}
                    value={formatNumber(autoRefreshProducts)}
                    type="success"
                />
                <MiniStat
                    label="Merch Products"
                    tooltip={MINI_STAT_TOOLTIPS['Merch Products']}
                    value={formatNumber(
                        keepaMerchCoverage.totalMerchProducts,
                    )}
                />
                <MiniStat
                    label="With Keepa"
                    tooltip={MINI_STAT_TOOLTIPS['With Keepa']}
                    value={formatNumber(
                        keepaMerchCoverage.merchProductsWithKeepaData,
                    )}
                    type="success"
                />
                <MiniStat
                    label="Without Keepa"
                    tooltip={MINI_STAT_TOOLTIPS['Without Keepa']}
                    value={formatNumber(
                        keepaMerchCoverage.merchProductsWithoutKeepaData,
                    )}
                    type="error"
                />
            </div>

            {/* Keepa refresh policy — full width */}
            <div className="border-t border-border">
                <KeepaRefreshPolicyPanel
                    buckets={keepaRefreshPolicyBuckets}
                    fetchGuardLabel={keepaFetchGuardLabel}
                    isLoading={isLoading}
                />
            </div>

            {/* Job executions */}
            {selectedConfig ? (
                <div className="flex min-h-0 flex-1 flex-col border-t border-border">
                    {jobQuery.isLoading ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
                    ) : jobQuery.error ? (
                        <p className="px-3 py-2 text-xs text-destructive">Failed to load.</p>
                    ) : jobs && jobs.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                            No jobs found.
                        </p>
                    ) : jobs && jobs.length > 0 ? (
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-accent">
                                    <tr className="border-b border-border">
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                            Started
                                        </th>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                            Job
                                        </th>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                            Status
                                        </th>
                                        <th className="px-3 py-1.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                            Duration
                                        </th>
                                        <th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                            Error
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {jobs.map((exec) => (
                                        <tr
                                            key={exec.id}
                                            className="border-b border-border last:border-0 hover:bg-muted/30"
                                        >
                                            <td className="whitespace-nowrap px-3 py-1 font-mono">
                                                {formatDateTime(exec.startedAt)}
                                            </td>
                                            <td className="max-w-[200px] truncate px-3 py-1 font-mono text-foreground">
                                                {exec.jobName}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-1">
                                                <span
                                                    className={cn(
                                                        'mr-1.5 inline-block size-1.5 rounded-full align-middle',
                                                        exec.status === 'success'
                                                            ? 'bg-success'
                                                            : 'bg-destructive',
                                                    )}
                                                />
                                                <span className="font-mono uppercase">
                                                    {exec.status}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-1 text-right font-mono">
                                                {formatDuration(exec.durationMs)}
                                            </td>
                                            <td
                                                className={cn(
                                                    'max-w-[140px] truncate px-3 py-1 font-mono',
                                                    exec.errorMessage
                                                        ? 'text-destructive'
                                                        : 'text-muted-foreground',
                                                )}
                                                title={exec.errorMessage ?? undefined}
                                            >
                                                {exec.errorMessage ?? '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

/* ── Sparkline ───────────────────────────── */

const VB_W = 200;
const VB_H = 32;

const Sparkline = ({
    buckets,
    stroke,
    id,
}: {
    buckets: number[];
    stroke: string;
    id: string;
}) => {
    if (buckets.length === 0) return null;

    const max = Math.max(...buckets, 1);
    const stepX = VB_W / (buckets.length - 1 || 1);
    const gradientId = `spark-${id.replace(/\s+/g, '-')}`;

    const points = buckets.map((v, i) => ({
        x: i * stepX,
        y: VB_H - (v / max) * VB_H * 0.85 - VB_H * 0.05,
    }));

    const linePath = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
        .join(' ');
    const areaPath = `${linePath} L${VB_W},${VB_H} L0,${VB_H} Z`;

    return (
        <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="mt-1.5 h-6 w-full"
            preserveAspectRatio="none"
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity="0.12" />
                    <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path
                d={linePath}
                fill="none"
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.6"
            />
        </svg>
    );
};

/* ── MiniStat ────────────────────────────── */

const MINI_STAT_COLORS: Record<StatType, string> = {
    neutral: 'text-foreground',
    success: 'text-success-foreground',
    error: 'text-destructive',
};

type MiniStatLabel =
    | 'Queued'
    | 'Auto Refresh'
    | 'Merch Products'
    | 'With Keepa'
    | 'Without Keepa';

const MiniStat = ({
    label,
    tooltip,
    value,
    type = 'neutral',
}: {
    label: MiniStatLabel;
    tooltip: string;
    value: string;
    type?: StatType;
}) => (
    <div className="border-r border-border px-3 py-2 last:border-r-0">
        <MetricLabel label={label} tooltip={tooltip} />
        <p
            className={cn(
                'stat-value font-mono text-base font-bold',
                MINI_STAT_COLORS[type],
            )}
        >
            {value}
        </p>
    </div>
);

const MetricLabel = ({
    label,
    tooltip,
}: {
    label: string;
    tooltip: string;
}) => (
    <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="inline-flex cursor-help" title={tooltip}>
            <CircleHelp className="size-3 opacity-70" aria-hidden="true" />
            <span className="sr-only">{tooltip}</span>
        </span>
    </div>
);
