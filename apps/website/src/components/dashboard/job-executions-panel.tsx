import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { Frame } from '@/components/ui/frame';
import { api, type RouterOutputs } from '@/lib/trpc';
import { cn, formatRelativeTime } from '@/lib/utils';

type JobExecution = RouterOutputs['api']['app']['jobExecutions'][number];

const statusDotClassByStatus: Record<string, string> = {
    success: 'bg-emerald-500',
    failed: 'bg-rose-500',
};

type JobExecutionsPanelProps = {
    className?: string;
    rowsClassName?: string;
};

export function JobExecutionsPanel({
    className,
    rowsClassName,
}: JobExecutionsPanelProps) {
    const [expandedExecutionId, setExpandedExecutionId] = useState<string | null>(null);
    const query = api.api.app.jobExecutions.useQuery(
        { limit: 25 },
        {
            retry: false,
            refetchInterval: 15000,
            refetchOnWindowFocus: false,
        }
    );

    const errorCode = query.error?.data?.code;
    if (errorCode === 'FORBIDDEN') {
        return null;
    }

    return (
        <div className={cn('mt-3 shrink-0', className)}>
            <Frame>
                <div className="flex items-center justify-between border-b border-[rgba(20,18,16,0.08)] px-4 py-3">
                    <div>
                        <p className="font-mono text-xs uppercase tracking-[0.15em] text-[#706454]">
                            Job Executions
                        </p>
                        <p className="mt-1 text-xs text-[#857869]">
                            Admin-only runtime history and logs
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            void query.refetch();
                        }}
                        disabled={query.isFetching}
                        className="rounded-md p-1.5 text-[#706454] transition-colors hover:bg-[rgba(20,18,16,0.08)] hover:text-[#221f1b] disabled:opacity-50"
                        aria-label="Refresh job executions"
                    >
                        {query.isFetching ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <RefreshCw className="size-4" />
                        )}
                    </button>
                </div>

                {query.isLoading && (
                    <p className="px-4 py-3 text-sm text-[#857869]">
                        Loading recent executions...
                    </p>
                )}

                {errorCode === 'UNAUTHORIZED' && (
                    <p className="px-4 py-3 text-sm text-[#B45309]">
                        Session expired. Please sign out and back in.
                    </p>
                )}

                {query.error &&
                    errorCode !== 'UNAUTHORIZED' &&
                    errorCode !== 'FORBIDDEN' && (
                        <p className="px-4 py-3 text-sm text-[#B91C1C]">
                            Failed to load job executions.
                        </p>
                    )}

                {!query.isLoading &&
                    !query.error &&
                    (query.data?.length ?? 0) === 0 && (
                        <p className="px-4 py-3 text-sm text-[#857869]">
                            No recent execution logs recorded.
                        </p>
                    )}

                {(query.data?.length ?? 0) > 0 && (
                    <div className={cn('max-h-[340px] overflow-y-auto', rowsClassName)}>
                        {query.data?.map(execution => {
                            const isExpanded = expandedExecutionId === execution.id;

                            return (
                                <ExecutionRow
                                    key={execution.id}
                                    execution={execution}
                                    isExpanded={isExpanded}
                                    onToggle={() => {
                                        setExpandedExecutionId(current =>
                                            current === execution.id ? null : execution.id
                                        );
                                    }}
                                />
                            );
                        })}
                    </div>
                )}
            </Frame>
        </div>
    );
}

const ExecutionRow = ({
    execution,
    isExpanded,
    onToggle,
}: {
    execution: JobExecution;
    isExpanded: boolean;
    onToggle: () => void;
}) => {
    const statusDotClass = statusDotClassByStatus[execution.status] ?? 'bg-amber-500';

    return (
        <div className="border-b border-[rgba(20,18,16,0.06)] last:border-b-0">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[rgba(20,18,16,0.03)]"
            >
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className={cn('inline-block size-2 rounded-full', statusDotClass)} />
                        <code className="truncate font-mono text-xs text-[#221f1b]">
                            {execution.jobName}
                        </code>
                    </div>
                    <p className="mt-1 text-xs text-[#857869]">
                        {formatRelativeTime(execution.startedAt)}
                        {'  '}
                        ({formatDateTime(execution.startedAt)}) {'  '}•{'  '}
                        {formatDuration(execution.durationMs)}
                    </p>
                </div>
                {isExpanded ? (
                    <ChevronUp className="mt-0.5 size-4 shrink-0 text-[#857869]" />
                ) : (
                    <ChevronDown className="mt-0.5 size-4 shrink-0 text-[#857869]" />
                )}
            </button>

            {isExpanded && (
                <div className="space-y-3 border-t border-[rgba(20,18,16,0.06)] px-4 py-3">
                    {execution.errorMessage && (
                        <p className="rounded-md bg-[rgba(185,28,28,0.08)] px-2.5 py-2 text-xs text-[#991B1B]">
                            {execution.errorMessage}
                        </p>
                    )}

                    <div className="grid gap-3 lg:grid-cols-2">
                        <JsonBlock label="Input" value={execution.input} />
                        <JsonBlock label="Output" value={execution.output} />
                    </div>

                    <div className="space-y-1.5">
                        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#706454]">
                            Logs
                        </p>
                        {execution.logs.length === 0 ? (
                            <p className="text-xs text-[#857869]">No logs captured.</p>
                        ) : (
                            <div className="max-h-[170px] overflow-y-auto rounded-md bg-[#141210] px-2.5 py-2">
                                {execution.logs.map(log => (
                                    <p
                                        key={log.id}
                                        className="font-mono text-[11px] leading-5 text-[#E5D8C9]"
                                    >
                                        <span className="text-[#B4A491]">
                                            {formatLogTime(log.createdAt)}
                                        </span>
                                        {'  '}
                                        <span className={getLogLevelClass(log.level)}>
                                            {log.level.toUpperCase()}
                                        </span>
                                        {'  '}
                                        {log.message}
                                        {log.context ? ` ${formatCompactJson(log.context)}` : ''}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const JsonBlock = ({
    label,
    value,
}: {
    label: string;
    value: unknown;
}) => {
    return (
        <div className="space-y-1.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#706454]">
                {label}
            </p>
            <pre className="max-h-[170px] overflow-auto rounded-md bg-[#141210] px-2.5 py-2 font-mono text-[11px] leading-5 text-[#E5D8C9]">
                {formatJson(value)}
            </pre>
        </div>
    );
};

const formatDuration = (durationMs: number) => {
    if (durationMs < 1000) {
        return `${durationMs}ms`;
    }

    if (durationMs < 60_000) {
        return `${(durationMs / 1000).toFixed(2)}s`;
    }

    const minutes = Math.floor(durationMs / 60_000);
    const seconds = Math.floor((durationMs % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
};

const formatDateTime = (isoDate: string) => {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
        return 'Invalid date';
    }

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date);
};

const formatLogTime = (isoDate: string) => {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
        return '--:--:--';
    }

    return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date);
};

const formatJson = (value: unknown) => {
    if (value === null || value === undefined) {
        return 'null';
    }

    try {
        const json = JSON.stringify(value, null, 2);
        if (json.length <= 4000) {
            return json;
        }
        return `${json.slice(0, 4000)}\n...truncated`;
    } catch {
        return String(value);
    }
};

const formatCompactJson = (value: unknown) => {
    try {
        const json = JSON.stringify(value);
        if (json.length <= 300) {
            return json;
        }
        return `${json.slice(0, 300)}...`;
    } catch {
        return String(value);
    }
};

const getLogLevelClass = (level: string) => {
    if (level === 'error') return 'text-[#FCA5A5]';
    if (level === 'warn') return 'text-[#FCD34D]';
    return 'text-[#86EFAC]';
};
