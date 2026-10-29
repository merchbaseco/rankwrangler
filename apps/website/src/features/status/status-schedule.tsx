import { Chip } from '@heroui/react';
import { DataGrid, type DataGridColumn } from '@heroui-pro/react';
import { formatCount } from './metrics/metric-format';
import {
    formatRelative,
    isPipelineFailing,
    pipelineLabels,
    pipelineSources,
    type SystemPipeline,
    type SystemStatus,
} from './status-model';
import { StatusSection } from './status-panel';

type ScheduleRow = SystemPipeline & { readonly failing: boolean };

/**
 * Every scheduled pipeline in one table, the way job schedulers show their jobs: status, last
 * run, next run and the backlog past due. Status follows `/api/health`.
 */
export const StatusSchedule = ({ status }: { status: SystemStatus }) => {
    const rows: ScheduleRow[] = status.pipelines.map(pipeline => ({
        ...pipeline,
        failing: isPipelineFailing(status, pipeline.pipeline),
    }));
    return (
        <StatusSection
            caption={
                status.health.status === 'degraded' && status.health.failing.includes('postgres')
                    ? 'Database unreachable'
                    : null
            }
            title="Schedules"
        >
            <DataGrid
                aria-label="Pipeline schedules"
                className="status-grid"
                columns={columns}
                data={rows}
                getRowId={row => row.pipeline}
                renderEmptyState={() => 'No pipelines.'}
            />
        </StatusSection>
    );
};

const mono = (value: string) => <span className="font-mono tabular-nums">{value}</span>;

const columns: DataGridColumn<ScheduleRow>[] = [
    {
        cell: row => (
            <span className="flex items-baseline gap-2">
                {pipelineLabels[row.pipeline]}
                <span className="text-muted text-sm">{pipelineSources[row.pipeline]}</span>
            </span>
        ),
        header: 'Pipeline',
        id: 'pipeline',
        isRowHeader: true,
    },
    {
        cell: row =>
            row.failing ? (
                <Chip color="warning" size="sm" variant="soft">
                    Behind
                </Chip>
            ) : (
                <Chip color="success" size="sm" variant="soft">
                    On schedule
                </Chip>
            ),
        header: 'Status',
        id: 'status',
        width: 140,
    },
    {
        align: 'end',
        cell: row => mono(formatRelative(row.lastRunAt)),
        header: 'Last run',
        id: 'last',
        width: 120,
    },
    {
        align: 'end',
        cell: row =>
            row.overdue > 0 ? (
                <span className="font-mono text-warning">Overdue</span>
            ) : (
                mono(formatRelative(row.nextDueAt))
            ),
        header: 'Next run',
        id: 'next',
        width: 120,
    },
    {
        align: 'end',
        cell: row =>
            row.overdue > 0 ? (
                <span className="font-mono text-warning tabular-nums">
                    {formatCount(row.overdue)}
                </span>
            ) : (
                mono('0')
            ),
        header: 'Overdue',
        id: 'overdue',
        width: 110,
    },
];
