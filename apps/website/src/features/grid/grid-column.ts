import type { DataGridColumn } from '@heroui-pro/react';
import type { ReactNode } from 'react';

/** When a column leaves: below 80rem (`wide`) or on phones (`secondary`). */
export type GridColumnPriority = 'wide' | 'secondary';

/**
 * One column of a Grid-direction DataGrid (Explore, Keywords). Its header and
 * cells carry `grid-col grid-col--<id>` so grid.css gives the column its
 * width token (`--col-<id>`; the KPI cells above sum the same tokens) and,
 * with a priority, the breakpoint it drops at. Widths live in CSS rather than
 * the `width` prop because they change per breakpoint.
 */
export const gridColumn = <T>(
    id: string,
    header: string,
    cell: (row: T) => ReactNode,
    options: {
        align?: 'end';
        allowsSorting?: boolean;
        isRowHeader?: boolean;
        priority?: GridColumnPriority;
    } = {}
): DataGridColumn<T> => {
    const className = [
        'grid-col',
        `grid-col--${id}`,
        options.priority && `grid-col--${options.priority}`,
    ]
        .filter(Boolean)
        .join(' ');
    return {
        align: options.align,
        allowsSorting: options.allowsSorting,
        cell,
        cellClassName: className,
        header,
        headerClassName: className,
        id,
        isRowHeader: options.isRowHeader,
    };
};
