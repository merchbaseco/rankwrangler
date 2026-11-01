import { Chip, useMediaQuery } from '@heroui/react';
import { DataGrid, type DataGridColumn } from '@heroui-pro/react';
import { useMemo, useState } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatCount } from '@/features/bsr/bsr-format';
import { useElementWidth } from '@/hooks/use-element-width';
import { cn } from '@/lib/utils';
import { accuracyBarsGeometry } from './sales-curve-geometry';
import {
    type AccuracyRow,
    type AccuracyStatus,
    accuracyRows,
    accuracyStatusLabels,
    formatGap,
} from './sales-curve-model';
import type { SalesCurveReport } from './use-sales-curve-fit';

const CHART_HEIGHT = 180;

/**
 * Whether the curve still matches Amazon: per rank range, the share of shirts
 * showing a badge (a column) against the share the curve expects (a tick),
 * then the same as a table with each range's status. Agreement means the
 * estimates hold; a widening gap means the season moved faster than the fit.
 */
export const SalesCurveAccuracy = ({ ranges }: { ranges: SalesCurveReport['ranges'] }) => {
    const rows = useMemo(() => accuracyRows(ranges), [ranges]);
    // A phone keeps the range, the two shares and the status.
    const isPhone = !useMediaQuery('(min-width: 48rem)', { initializeWithValue: true });
    return (
        <div className="sales-curve-accuracy">
            <AccuracyBars rows={rows} />
            <ul className="status-legend">
                <li className="status-legend__item">
                    <span aria-hidden className="sales-curve-key sales-curve-key--actual" />
                    Actually show a badge
                </li>
                <li className="status-legend__item">
                    <span aria-hidden className="sales-curve-key sales-curve-key--expected" />
                    Curve expects
                </li>
            </ul>
            <DataGrid
                aria-label="Badge share by rank range, actual against expected"
                className="hairline-grid"
                columns={isPhone ? phoneColumns : columns}
                data={rows}
                getRowId={row => row.id}
                variant="secondary"
            />
        </div>
    );
};

const AccuracyBars = ({ rows }: { rows: readonly AccuracyRow[] }) => {
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const geometry = useMemo(
        () => (width > 0 ? accuracyBarsGeometry(rows, { height: CHART_HEIGHT, width }) : null),
        [rows, width]
    );
    const [hovered, setHovered] = useState<number | null>(null);
    const row = hovered === null ? null : rows[hovered];
    return (
        <div className="sales-curve" ref={ref}>
            {geometry ? (
                <CursorTooltip
                    content={row ? <RangeTip row={row} /> : null}
                    triggerClassName="block"
                >
                    <svg
                        aria-label="Share of shirts showing a badge by rank range, against the curve's expectation"
                        height={CHART_HEIGHT}
                        onPointerLeave={() => setHovered(null)}
                        role="img"
                        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
                        width={width}
                    >
                        <path className="sales-curve__grid" d={geometry.grid} />
                        <line
                            className="sales-curve__baseline"
                            x1={geometry.plot.left}
                            x2={geometry.plot.right}
                            y1={geometry.plot.bottom}
                            y2={geometry.plot.bottom}
                        />
                        {geometry.yTicks.map(tick => (
                            <text
                                className="sales-curve__tick"
                                dominantBaseline="middle"
                                key={tick.label}
                                textAnchor="end"
                                x={geometry.plot.left - 8}
                                y={tick.y}
                            >
                                {tick.label}
                            </text>
                        ))}
                        {geometry.bars.map((bar, index) => (
                            <g
                                className={cn(
                                    'sales-curve__range-bar',
                                    hovered !== null && hovered !== index && 'is-dimmed'
                                )}
                                key={rows[index]?.id}
                                onPointerEnter={() => setHovered(index)}
                            >
                                <rect
                                    className="sales-curve__hit"
                                    height={geometry.plot.bottom - geometry.plot.top}
                                    width={bar.slot.width}
                                    x={bar.slot.x}
                                    y={geometry.plot.top}
                                />
                                <path className="sales-curve__actual" d={bar.column} />
                                <line
                                    className="sales-curve__expected"
                                    x1={bar.expected.x1}
                                    x2={bar.expected.x2}
                                    y1={bar.expected.y}
                                    y2={bar.expected.y}
                                />
                            </g>
                        ))}
                        {geometry.edges.map(edge => (
                            <text
                                className="sales-curve__tick"
                                key={edge.label}
                                textAnchor="middle"
                                x={edge.x}
                                y={CHART_HEIGHT - 6}
                            >
                                {edge.label}
                            </text>
                        ))}
                    </svg>
                </CursorTooltip>
            ) : null}
        </div>
    );
};

const RangeTip = ({ row }: { row: AccuracyRow }) => (
    <span className="flex flex-col">
        <span className="font-mono font-semibold">{row.label}</span>
        <span className="text-muted">
            {percent(row.actual)} of {formatCount(row.products)} show a badge · curve expects{' '}
            {percent(row.expected)}
        </span>
    </span>
);

const statusColor: Readonly<Record<AccuracyStatus, 'success' | 'warning' | 'danger'>> = {
    onTrack: 'success',
    watch: 'warning',
    off: 'danger',
};

const columns: DataGridColumn<AccuracyRow>[] = [
    {
        cell: row => <span className="font-mono">{row.label}</span>,
        header: 'Rank range',
        id: 'range',
        isRowHeader: true,
    },
    {
        align: 'end',
        cell: row => <span className="font-mono tabular-nums">{formatCount(row.products)}</span>,
        header: 'Shirts checked',
        id: 'products',
    },
    {
        align: 'end',
        cell: row => <span className="font-mono tabular-nums">{percent(row.actual)}</span>,
        header: 'Actually show a badge',
        id: 'actual',
    },
    {
        align: 'end',
        cell: row => <span className="font-mono tabular-nums">{percent(row.expected)}</span>,
        header: 'Curve expects',
        id: 'expected',
    },
    {
        align: 'end',
        cell: row => <span className="font-mono tabular-nums">{formatGap(row.gap)}</span>,
        header: 'Difference',
        id: 'gap',
    },
    {
        align: 'end',
        cell: row => (
            <Chip color={statusColor[row.status]} size="sm" variant="soft">
                {accuracyStatusLabels[row.status]}
            </Chip>
        ),
        header: 'Status',
        id: 'status',
        width: 104,
    },
];

const phoneColumns = columns.filter(column => column.id !== 'products' && column.id !== 'gap');

const percent = (share: number) => `${Math.round(share * 100)}%`;
