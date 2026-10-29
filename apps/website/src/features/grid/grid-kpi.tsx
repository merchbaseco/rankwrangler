import { KPI } from '@heroui-pro/react/kpi';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One KPI header cell over a column group (Grid J/K/I): a dot and title, the
 * figure with a muted suffix, then the cell's dot band (or the hatch over the
 * name columns) below a hairline. The group lays out on the grid's column
 * template (`grid-kpis--explore` etc., grid.css) and `span` names the column
 * group a cell covers, so its edges meet the grid's own.
 */
export const GridKpi = ({
    actions,
    band,
    dot,
    figure,
    span,
    suffix,
    title,
}: {
    /** A trailing control in the header line (the narrow-screen Filters button). */
    actions?: ReactNode;
    /** The dot band; omitted draws the hatch, `false` leaves the cell a figure line only. */
    band?: ReactNode | false;
    /** The title dot's ink scope (`band-ink-accent`, `tier-hot`, …); omitted draws none. */
    dot?: string;
    /** The figure: a `KPI.Value` (see `KpiFigure`). */
    figure: ReactNode;
    span: string;
    suffix?: ReactNode;
    title: ReactNode;
}) => (
    <KPI className={cn('grid-kpi', `grid-kpi--${span}`)}>
        <KPI.Header>
            {dot ? <span aria-hidden className={cn('kpi-dot', dot)} /> : null}
            <KPI.Title>{title}</KPI.Title>
            {actions}
        </KPI.Header>
        <KPI.Content>
            {figure}
            {suffix ? <span className="grid-kpi__suffix">{suffix}</span> : null}
        </KPI.Content>
        {band === false ? null : (band ?? <span aria-hidden className="grid-kpi__hatch" />)}
    </KPI>
);

/**
 * A KPI cell's figure on the stock KPI.Value: grouped digits by default,
 * `compact` for `118K`, `percent` for a 0..1 share, a `#` prefix for ranks,
 * `average` with one decimal under 10 (`0.3`, `1,405`),
 * and an em dash when the server has no value.
 */
export const KpiFigure = ({
    format = 'count',
    value,
}: {
    format?: 'average' | 'count' | 'compact' | 'percent' | 'rank' | 'rankExact';
    value: number | null;
}) => {
    if (value === null) {
        return <KPI.Value value={0}>{() => '—'}</KPI.Value>;
    }
    switch (format) {
        case 'compact':
            return <KPI.Value maximumFractionDigits={1} notation="compact" value={value} />;
        case 'percent':
            return <KPI.Value maximumFractionDigits={0} style="percent" value={value} />;
        case 'rank':
            return (
                <KPI.Value maximumFractionDigits={0} notation="compact" value={value}>
                    {formatted => `#${formatted}`}
                </KPI.Value>
            );
        case 'average':
            return <KPI.Value maximumFractionDigits={value < 10 ? 1 : 0} value={value} />;
        case 'rankExact':
            return (
                <KPI.Value maximumFractionDigits={0} value={value}>
                    {formatted => `#${formatted}`}
                </KPI.Value>
            );
        case 'count':
            return <KPI.Value maximumFractionDigits={0} value={value} />;
        default:
            return format satisfies never;
    }
};
