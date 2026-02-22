import { useMemo, useState } from 'react';
import {
    type AdminStatLabel,
    type JobStatusFilter,
    STAT_FILTER_CONFIG,
    isStatFilterLabel,
} from '@/components/dashboard/admin-operations-panel-config';
import { formatDateTime, formatDuration } from '@/components/dashboard/job-executions-panel/formatters';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/trpc';
import { cn, formatNumber } from '@/lib/utils';

const COLS = 3;

export const AdminOperationsPanel = () => {
    const [selectedStat, setSelectedStat] = useState<AdminStatLabel | null>(null);

    const { data, isLoading } = api.api.app.getAdminStats.useQuery(undefined, {
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
    });

    const stats = data?.stats ?? [];
    const rows = Math.ceil(stats.length / COLS);
    const defaultSelectedStat = stats
        .map((stat) => stat.label)
        .find((label): label is AdminStatLabel => isStatFilterLabel(label));

    const effectiveSelectedStat = selectedStat ?? defaultSelectedStat ?? null;

    const selectedConfig =
        effectiveSelectedStat === null ? undefined : STAT_FILTER_CONFIG[effectiveSelectedStat];

    const queryInput = useMemo(() => {
        if (selectedConfig === undefined) {
            return undefined;
        }

        const input: {
            limit: number;
            status?: JobStatusFilter;
            jobNames?: string[];
        } = { limit: 100 };

        if (selectedConfig.status !== undefined) {
            input.status = selectedConfig.status;
        }

        if (selectedConfig.jobNames !== undefined) {
            input.jobNames = [...selectedConfig.jobNames];
        }

        return input;
    }, [selectedConfig]);

    const jobQuery = api.api.app.jobExecutions.useQuery(queryInput, {
        enabled: selectedConfig !== undefined,
        retry: false,
        refetchOnWindowFocus: false,
    });

    return (
        <div className="rounded-sm border border-border bg-card overflow-hidden">
            {isLoading ? (
                <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                    Loading stats...
                </p>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3">
                    {stats.map((stat, i) => {
                        const col = i % COLS;
                        const row = Math.floor(i / COLS);
                        const isLastCol = col === COLS - 1;
                        const isLastRow = row === rows - 1;
                        const hasDetailView = isStatFilterLabel(stat.label);
                        const isSelected = effectiveSelectedStat === stat.label;

                        return (
                            <button
                                key={stat.label}
                                type="button"
                                disabled={!hasDetailView}
                                onClick={() => {
                                    if (!hasDetailView) {
                                        return;
                                    }

                                    if (effectiveSelectedStat === stat.label) {
                                        void jobQuery.refetch();
                                        return;
                                    }

                                    setSelectedStat(stat.label);
                                }}
                                className={cn(
                                    'flex flex-col justify-between p-3 text-left transition-colors',
                                    !isLastCol && 'border-r border-border',
                                    !isLastRow && 'border-b border-border',
                                    hasDetailView && 'hover:bg-accent cursor-pointer',
                                    !hasDetailView && 'cursor-default disabled:opacity-100',
                                    isSelected && 'bg-primary/10',
                                )}
                            >
                                <div>
                                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
                                        {stat.label}
                                    </p>
                                    <p className="font-display mt-0.5 text-xl font-semibold text-foreground tabular-nums">
                                        {formatNumber(stat.total)}
                                    </p>
                                </div>
                                <Sparkline buckets={stat.buckets} />
                            </button>
                        );
                    })}
                </div>
            )}

            {selectedConfig ? (
                <div className="border-t border-border">
                    {jobQuery.isLoading ? (
                        <p className="text-muted-foreground px-3 py-3 text-sm">Loading job rows...</p>
                    ) : null}
                    {jobQuery.error ? (
                        <p className="text-destructive px-3 py-3 text-sm">Failed to load job rows.</p>
                    ) : null}
                    {jobQuery.data && jobQuery.data.length === 0 ? (
                        <p className="text-muted-foreground px-3 py-3 text-sm">No matching job rows found.</p>
                    ) : null}

                    {jobQuery.data && jobQuery.data.length > 0 ? (
                        <div className="max-h-[460px] overflow-auto">
                            <table className="w-full table-auto text-sm">
                                <colgroup>
                                    <col className="w-[180px]" />
                                    <col />
                                    <col className="w-[130px]" />
                                    <col className="w-[90px]" />
                                    <col className="w-[140px]" />
                                </colgroup>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>Started</TableHead>
                                        <TableHead>Job</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Duration</TableHead>
                                        <TableHead>Error</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {jobQuery.data.map((execution) => (
                                        <TableRow key={execution.id}>
                                            <TableCell className="font-mono text-xs">
                                                {formatDateTime(execution.startedAt)}
                                            </TableCell>
                                            <TableCell>
                                                <code className="text-foreground block truncate font-mono text-xs">
                                                    {execution.jobName}
                                                </code>
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={cn(
                                                        'inline-block size-2 rounded-full align-middle mr-1.5',
                                                        execution.status === 'success'
                                                            ? 'bg-success'
                                                            : 'bg-destructive',
                                                    )}
                                                />
                                                <span className="font-mono text-xs uppercase">
                                                    {execution.status}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs">
                                                {formatDuration(execution.durationMs)}
                                            </TableCell>
                                            <TableCell
                                                className={cn(
                                                    'max-w-[140px] truncate font-mono text-xs',
                                                    execution.errorMessage
                                                        ? 'text-destructive'
                                                        : 'text-muted-foreground',
                                                )}
                                                title={execution.errorMessage ?? undefined}
                                            >
                                                {execution.errorMessage ?? '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </table>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

const VB_W = 200;
const VB_H = 40;

const Sparkline = ({ buckets }: { buckets: number[] }) => {
    if (buckets.length === 0) return null;

    const max = Math.max(...buckets, 1);
    const stepX = VB_W / (buckets.length - 1 || 1);

    const points = buckets.map((v, i) => ({
        x: i * stepX,
        y: VB_H - (v / max) * VB_H * 0.85 - VB_H * 0.05,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L${VB_W},${VB_H} L0,${VB_H} Z`;

    return (
        <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="mt-2 h-8 w-full"
            preserveAspectRatio="none"
        >
            <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#sparkFill)" />
            <path
                d={linePath}
                fill="none"
                stroke="var(--color-foreground)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.5"
            />
        </svg>
    );
};
