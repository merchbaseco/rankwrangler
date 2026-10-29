import { Chip, Spinner } from '@heroui/react';
import { DataGrid, type DataGridColumn, ItemCardGroup, Segment } from '@heroui-pro/react';
import { useState } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { type JobOutcome, jobRunFilter } from './job-run-filters';
import { formatDuration, formatMetricDateTime } from './metric-format';
import { type JobExecution, useJobExecutions } from './use-job-executions';

/**
 * The runs behind a provider's stat tiles: the 100 most recent of its jobs,
 * narrowed by the same outcome the tiles count. `isEventDriven` lists stop
 * polling and refresh when `jobs.activity` reports a run (`useJobActivity`).
 */
export const JobRunsSection = ({
    isEventDriven = false,
    jobNames,
}: {
    isEventDriven?: boolean;
    jobNames: readonly string[];
}) => {
    const [outcome, setOutcome] = useState<JobOutcome>('all');
    const query = useJobExecutions(jobRunFilter(jobNames, outcome), isEventDriven);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header className="flex flex-wrap items-center justify-between gap-3">
                <ItemCardGroup.Title>Recent runs</ItemCardGroup.Title>
                <Segment
                    aria-label="Run outcome"
                    onSelectionChange={key => setOutcome(key as JobOutcome)}
                    selectedKey={outcome}
                    size="sm"
                >
                    <Segment.Item id="all">All</Segment.Item>
                    <Segment.Item id="success">Succeeded</Segment.Item>
                    <Segment.Item id="failed">Failed</Segment.Item>
                </Segment>
            </ItemCardGroup.Header>
            <DataGrid
                aria-label="Recent job runs"
                columns={columns}
                data={query.data ?? []}
                getRowId={run => run.id}
                renderEmptyState={() => {
                    if (query.isLoading) {
                        return <Spinner size="sm" />;
                    }
                    return query.error ? 'Job runs did not load.' : 'No runs match.';
                }}
            />
        </ItemCardGroup>
    );
};

const columns: DataGridColumn<JobExecution>[] = [
    {
        cell: run => <span className="font-mono">{formatMetricDateTime(run.startedAt)}</span>,
        header: 'Started',
        id: 'startedAt',
        width: 150,
    },
    {
        cell: run => (
            <span className="block truncate font-mono" data-selectable-text>
                {run.jobName}
            </span>
        ),
        header: 'Job',
        id: 'jobName',
        isRowHeader: true,
        minWidth: 180,
    },
    {
        cell: run => (
            <Chip color={run.status === 'success' ? 'success' : 'danger'} size="sm" variant="soft">
                {run.status}
            </Chip>
        ),
        header: 'Status',
        id: 'status',
        width: 96,
    },
    {
        align: 'end',
        cell: run => <span className="font-mono">{formatDuration(run.durationMs)}</span>,
        header: 'Duration',
        id: 'duration',
        width: 96,
    },
    {
        cell: run =>
            run.errorMessage ? (
                <CursorTooltip
                    content={run.errorMessage}
                    triggerClassName="block truncate font-mono text-danger"
                >
                    <span data-selectable-text>{run.errorMessage}</span>
                </CursorTooltip>
            ) : (
                <span className="text-muted">—</span>
            ),
        header: 'Error',
        id: 'error',
        minWidth: 160,
    },
];
