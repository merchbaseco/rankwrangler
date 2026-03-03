import { api } from '@/lib/trpc';
import type { RouterOutputs } from '@/lib/trpc';
import { cn, formatNumber } from '@/lib/utils';

const SETTINGS_METRICS_POLL_INTERVAL_MS = 10_000;

type DatasetRow = RouterOutputs['api']['app']['topSearchTermsStatus']['datasets']['daily'][number];

export const TopSearchTermsMetricsPanel = () => {
    const statusQuery = api.api.app.topSearchTermsStatus.useQuery(undefined, {
        refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        retry: false,
    });

    if (statusQuery.isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading Top Search Terms metrics…</p>
            </div>
        );
    }

    if (statusQuery.error || !statusQuery.data) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-destructive">Failed to load Top Search Terms metrics.</p>
            </div>
        );
    }

    const { stats, datasets } = statusQuery.data;

    return (
        <div className="flex h-full flex-col">
            <div className="grid grid-cols-3 border-b border-border">
                <StatTile
                    label="Top Search Terms"
                    value={formatNumber(stats.totalTopSearchTerms)}
                    valueClassName="text-foreground"
                />
                <StatTile
                    label="Job Successes"
                    value={formatNumber(stats.jobSuccesses)}
                    valueClassName="text-success-foreground"
                    withLeftBorder
                />
                <StatTile
                    label="Job Failures"
                    value={formatNumber(stats.jobFailures)}
                    valueClassName="text-destructive"
                    withLeftBorder
                />
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                <DatasetTable
                    title="Daily Datasets"
                    subtitle="Day-level windows (rolling retention)"
                    rows={datasets.daily}
                />
                <DatasetTable
                    title="Weekly Datasets"
                    subtitle="Week-level windows (long-term history)"
                    rows={datasets.weekly}
                />
            </div>
        </div>
    );
};

const StatTile = ({
    label,
    value,
    valueClassName,
    withLeftBorder = false,
}: {
    label: string;
    value: string;
    valueClassName: string;
    withLeftBorder?: boolean;
}) => {
    return (
        <div className={cn('p-3', withLeftBorder && 'border-l border-border')}>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            <p className={cn('stat-value mt-1 font-mono text-2xl font-bold', valueClassName)}>
                {value}
            </p>
        </div>
    );
};

const DatasetTable = ({
    title,
    subtitle,
    rows,
}: {
    title: string;
    subtitle: string;
    rows: DatasetRow[];
}) => {
    return (
        <section className="border-b border-border last:border-b-0">
            <div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                    {formatNumber(rows.length)} rows
                </p>
            </div>

            {rows.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">No dataset rows yet.</p>
            ) : (
                <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-accent">
                        <tr className="border-b border-border">
                            <TableHeader>Period</TableHeader>
                            <TableHeader>Status</TableHeader>
                            <TableHeader>Keywords</TableHeader>
                            <TableHeader>Last Fetched</TableHeader>
                            <TableHeader>Next Refresh</TableHeader>
                            <TableHeader>Error</TableHeader>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => (
                            <tr
                                key={row.id}
                                className="border-b border-border last:border-0 hover:bg-muted/30"
                            >
                                <td className="whitespace-nowrap px-3 py-1 font-mono text-foreground">
                                    {formatPeriod(row)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-1">
                                    <StatusPill row={row} />
                                </td>
                                <td className="whitespace-nowrap px-3 py-1 font-mono text-foreground">
                                    {row.keywordCount === null ? '—' : formatNumber(row.keywordCount)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-1 font-mono text-muted-foreground">
                                    {formatDateTime(row.latestFetchedAt ?? row.lastCompletedAt)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-1 font-mono text-muted-foreground">
                                    {formatDateTime(row.nextRefreshAt)}
                                </td>
                                <td
                                    className={cn(
                                        'max-w-[260px] truncate px-3 py-1 font-mono',
                                        row.lastError ? 'text-destructive' : 'text-muted-foreground'
                                    )}
                                    title={row.lastError ?? undefined}
                                >
                                    {row.lastError ?? '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
};

const TableHeader = ({ children }: { children: string }) => {
    return (
        <th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {children}
        </th>
    );
};

const StatusPill = ({ row }: { row: DatasetRow }) => {
    const status = getDatasetStatusLabel(row);
    return (
        <>
            <span
                className={cn(
                    'mr-1.5 inline-block size-1.5 rounded-full align-middle',
                    status.colorClass
                )}
            />
            <span className="font-mono uppercase text-foreground">{status.label}</span>
        </>
    );
};

const getDatasetStatusLabel = (row: DatasetRow) => {
    if (row.status === 'completed') {
        return { label: 'ready', colorClass: 'bg-success' };
    }
    if (row.status === 'queued' || row.status === 'in_progress' || row.refreshing) {
        return { label: 'fetching', colorClass: 'bg-info' };
    }
    if (row.status === 'failed') {
        return { label: 'failed', colorClass: 'bg-destructive' };
    }
    return { label: 'pending', colorClass: 'bg-warning' };
};

const formatPeriod = (row: DatasetRow) => {
    if (row.reportPeriod === 'DAY') {
        return row.dataStartDate;
    }

    return `${row.dataStartDate} → ${row.dataEndDate}`;
};

const formatDateTime = (isoDate: string | null) => {
    if (!isoDate) {
        return '—';
    }

    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date);
};
