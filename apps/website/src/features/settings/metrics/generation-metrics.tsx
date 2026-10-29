import { Chip } from '@heroui/react';
import { DataGrid, type DataGridColumn, ItemCardGroup } from '@heroui-pro/react';
import { BarChart } from '@heroui-pro/react/bar-chart';
import { formatMetricDateTime } from './metric-format';
import { MetricKpiGroup, type MetricTile } from './metric-kpi-group';

export interface GenerationHour {
    readonly failed: number;
    readonly generated: number;
    readonly hour: string;
}

export interface GenerationRun {
    readonly asin: string | null;
    readonly label: string;
    readonly occurredAt: string;
    readonly tone: 'success' | 'danger' | 'default';
}

/**
 * The shape both on-request generators share (short names, cutouts): coverage
 * of the catalog, the last day's activity, an hourly chart, and recent runs.
 */
export const GenerationMetrics = ({
    activity,
    coverage,
    generatedLabel,
    hourly,
    note,
    recent,
}: {
    activity: readonly MetricTile[];
    coverage: readonly MetricTile[];
    generatedLabel: string;
    hourly: readonly GenerationHour[];
    note: string;
    recent: readonly GenerationRun[];
}) => (
    <div className="flex flex-col gap-4">
        <MetricKpiGroup tiles={coverage} />
        <MetricKpiGroup tiles={activity} />
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Activity · last 24 hours</ItemCardGroup.Title>
                <ItemCardGroup.Description>{note}</ItemCardGroup.Description>
            </ItemCardGroup.Header>
            <BarChart
                aria-label={`Hourly ${generatedLabel.toLowerCase()} and failed runs`}
                data={hourly.map(hour => ({ ...hour, label: hourLabel(hour.hour) }))}
                height={140}
            >
                <BarChart.Grid vertical={false} />
                <BarChart.XAxis dataKey="label" interval={3} tickMargin={6} />
                <BarChart.YAxis allowDecimals={false} width={32} />
                <BarChart.Bar
                    dataKey="generated"
                    fill="var(--chart-1)"
                    name={generatedLabel}
                    stackId="runs"
                />
                <BarChart.Bar dataKey="failed" fill="var(--danger)" name="Failed" stackId="runs" />
                <BarChart.Tooltip content={<BarChart.TooltipContent />} />
            </BarChart>
        </ItemCardGroup>
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Recent runs</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <DataGrid
                aria-label="Recent generation runs"
                columns={columns}
                data={recent.map((run, index) => ({ ...run, id: `${run.occurredAt}:${index}` }))}
                getRowId={run => run.id}
                renderEmptyState={() => 'No generation activity yet.'}
            />
        </ItemCardGroup>
    </div>
);

const columns: DataGridColumn<GenerationRun & { id: string }>[] = [
    {
        cell: run => (
            <span className="font-mono" data-selectable-text>
                {run.asin ?? '—'}
            </span>
        ),
        header: 'Product',
        id: 'asin',
        isRowHeader: true,
    },
    {
        cell: run => (
            <Chip color={run.tone} size="sm" variant="soft">
                {run.label}
            </Chip>
        ),
        header: 'Outcome',
        id: 'outcome',
    },
    {
        align: 'end',
        cell: run => (
            <span className="font-mono text-muted">{formatMetricDateTime(run.occurredAt)}</span>
        ),
        header: 'When',
        id: 'occurredAt',
    },
];

const hourLabel = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleTimeString('en-US', { hour: 'numeric' });
};
