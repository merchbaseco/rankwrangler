import { Chip, useMediaQuery } from '@heroui/react';
import { DataGrid, type DataGridColumn } from '@heroui-pro/react';
import { useMemo } from 'react';
import { formatCount } from '@/features/bsr/bsr-format';
import {
    type AccuracyRow,
    type AccuracyStatus,
    accuracyRows,
    accuracyStatusLabels,
} from './sales-curve-model';
import { SegmentedBar } from './status-panel';
import type { SalesCurveReport } from './use-sales-curve-fit';

/**
 * Whether the curve still matches Amazon, one rank range a row: the share of
 * its shirts showing a badge as the status page's bar, the share the curve
 * expects as an accent tick on it, and the range's status. Agreement means the
 * estimates hold; a widening gap means the season moved faster than the fit.
 */
export const SalesCurveAccuracy = ({ ranges }: { ranges: SalesCurveReport['ranges'] }) => {
    const rows = useMemo(() => accuracyRows(ranges), [ranges]);
    // A phone keeps the range, the bar and the status.
    const isPhone = !useMediaQuery('(min-width: 48rem)', { initializeWithValue: true });
    return (
        <DataGrid
            aria-label="Shirts showing a badge by rank range, against the curve's expectation"
            className="hairline-grid"
            columns={isPhone ? phoneColumns : columns}
            data={rows}
            getRowId={row => row.id}
            variant="secondary"
        />
    );
};

const statusColor: Readonly<Record<AccuracyStatus, 'success' | 'warning' | 'danger'>> = {
    onTrack: 'success',
    watch: 'warning',
    off: 'danger',
};

const columns: DataGridColumn<AccuracyRow>[] = [
    {
        cell: row => <span className="font-mono">{row.label}</span>,
        header: 'BSR',
        id: 'range',
        isRowHeader: true,
    },
    {
        align: 'end',
        cell: row => <span className="font-mono tabular-nums">{formatCount(row.products)}</span>,
        header: 'Shirts',
        id: 'products',
        width: 96,
    },
    {
        cell: row => (
            <span className="sales-curve-share">
                <SegmentedBar
                    label={row.label}
                    marker={{
                        at: row.expected,
                        label: `Curve expects ${percent(row.expected)}`,
                        tone: 'accent',
                    }}
                    segments={[
                        {
                            key: 'badged',
                            label: 'Showing a badge',
                            tone: 'idle',
                            value: row.badged,
                        },
                    ]}
                    size="sm"
                    total={row.products}
                />
                <span className="sales-curve-share__value">{percent(row.actual)}</span>
            </span>
        ),
        header: 'Showing a badge',
        id: 'actual',
    },
    {
        align: 'end',
        cell: row => (
            <span className="font-mono tabular-nums text-muted">{percent(row.expected)}</span>
        ),
        header: 'Curve expects',
        id: 'expected',
        width: 128,
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

const phoneColumns = columns.filter(column => column.id !== 'products' && column.id !== 'expected');

const percent = (share: number) => `${Math.round(share * 100)}%`;
