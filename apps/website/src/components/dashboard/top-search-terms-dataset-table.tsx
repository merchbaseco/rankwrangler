import type { RouterOutputs } from '@/lib/trpc';
import { cn, formatNumber } from '@/lib/utils';

type DatasetRow = RouterOutputs['api']['app']['topSearchTermsStatus']['datasets']['daily'][number];

export const TopSearchTermsDatasetTable = ({
    rows,
}: {
    rows: DatasetRow[];
}) => {
    if (rows.length === 0) {
        return <p className="px-3 py-3 text-xs text-muted-foreground">No dataset rows yet.</p>;
    }

    return (
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
                {rows.map((row) => (
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
                                row.lastError ? 'text-destructive' : 'text-muted-foreground',
                            )}
                            title={row.lastError ?? undefined}
                        >
                            {row.lastError ?? '—'}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
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
