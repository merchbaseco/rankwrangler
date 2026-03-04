import type { RouterOutputs } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
    formatCompactJson,
    formatDateTime,
    formatDuration,
} from '@/components/dashboard/job-executions-panel/formatters';

type JobExecution = RouterOutputs['api']['app']['jobExecutions'][number];

export const TopSearchTermsJobExecutionsTable = ({
    jobs,
    filter,
}: {
    jobs: JobExecution[];
    filter: 'success' | 'failed';
}) => {
    if (jobs.length === 0) {
        return <p className="px-3 py-2 text-xs text-muted-foreground">No jobs found.</p>;
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border bg-accent px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {filter === 'success'
                        ? 'Recent Successful Top Search Terms Jobs'
                        : 'Recent Failed Top Search Terms Jobs'}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                    100 most recent sync/fetch executions with concise output summaries
                </p>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-accent">
                        <tr className="border-b border-border">
                            <TableHeader>Started</TableHeader>
                            <TableHeader>Job</TableHeader>
                            <TableHeader>Status</TableHeader>
                            <TableHeader className="text-right">Duration</TableHeader>
                            <TableHeader>Summary</TableHeader>
                            <TableHeader>Error</TableHeader>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((execution) => (
                            <tr
                                key={execution.id}
                                className="border-b border-border last:border-0 hover:bg-muted/30"
                            >
                                <td className="whitespace-nowrap px-3 py-1 font-mono">
                                    {formatDateTime(execution.startedAt)}
                                </td>
                                <td className="max-w-[220px] truncate px-3 py-1 font-mono text-foreground">
                                    {execution.jobName}
                                </td>
                                <td className="whitespace-nowrap px-3 py-1">
                                    <span
                                        className={cn(
                                            'mr-1.5 inline-block size-1.5 rounded-full align-middle',
                                            execution.status === 'success'
                                                ? 'bg-success'
                                                : 'bg-destructive'
                                        )}
                                    />
                                    <span className="font-mono uppercase">{execution.status}</span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-1 text-right font-mono">
                                    {formatDuration(execution.durationMs)}
                                </td>
                                <td
                                    className="max-w-[420px] truncate px-3 py-1 font-mono text-muted-foreground"
                                    title={summarizeTopSearchTermsExecution(execution)}
                                >
                                    {summarizeTopSearchTermsExecution(execution)}
                                </td>
                                <td
                                    className={cn(
                                        'max-w-[220px] truncate px-3 py-1 font-mono',
                                        execution.errorMessage
                                            ? 'text-destructive'
                                            : 'text-muted-foreground'
                                    )}
                                    title={execution.errorMessage ?? undefined}
                                >
                                    {execution.errorMessage ?? '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const TableHeader = ({
    children,
    className,
}: {
    children: string;
    className?: string;
}) => {
    return (
        <th
            className={cn(
                'px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground',
                className
            )}
        >
            {children}
        </th>
    );
};

const summarizeTopSearchTermsExecution = (execution: JobExecution) => {
    if (!isRecord(execution.output)) {
        return execution.errorMessage ?? '—';
    }

    if (execution.jobName === 'sync-top-search-terms-datasets') {
        const dueCount = getNumber(execution.output, 'dueCount');
        const queuedCount = getNumber(execution.output, 'queuedCount');
        const insertedCount = getNumber(execution.output, 'insertedCount');
        const deletedCount = getNumber(execution.output, 'deletedCount');

        if (
            dueCount !== null &&
            queuedCount !== null &&
            insertedCount !== null &&
            deletedCount !== null
        ) {
            return `Queued ${queuedCount}/${dueCount}; inserted ${insertedCount}, deleted ${deletedCount}`;
        }
    }

    if (execution.jobName === 'fetch-top-search-terms-dataset') {
        const step = getString(execution.output, 'step');
        if (step === 'report_requested') {
            const reportId = getString(execution.output, 'reportId');
            return reportId ? `Requested report ${reportId}` : 'Requested BA report';
        }
        if (step === 'report_pending') {
            const reportId = getString(execution.output, 'reportId');
            const processingStatus = getString(execution.output, 'processingStatus');
            if (reportId && processingStatus) {
                return `Report ${reportId} still ${processingStatus}`;
            }
            return 'Report still processing; recheck scheduled';
        }
        if (step === 'report_processed') {
            const keywordCount = getNumber(execution.output, 'keywordCount');
            if (keywordCount !== null) {
                return `Persisted snapshot (${keywordCount} keywords)`;
            }
            return 'Persisted report snapshot';
        }
        const reason = getString(execution.output, 'reason');
        if (reason) {
            return reason;
        }
    }

    return formatCompactJson(execution.output);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const getString = (value: Record<string, unknown>, key: string) => {
    const candidate = value[key];
    return typeof candidate === 'string' ? candidate : null;
};

const getNumber = (value: Record<string, unknown>, key: string) => {
    const candidate = value[key];
    return typeof candidate === 'number' ? candidate : null;
};
