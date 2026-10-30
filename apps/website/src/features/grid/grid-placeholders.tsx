import { Skeleton } from '@heroui/react';
import type { DataGridColumn } from '@heroui-pro/react';

/**
 * A stand-in row while a grid's first page loads. The grid renders a page of them instead of an
 * empty state, so its columns and row heights are already the loaded grid's and nothing moves
 * when the rows arrive (an empty-state cell spans hidden columns and re-flows the fixed layout).
 */
export interface GridPlaceholder {
    readonly placeholderId: string;
}

export const isGridPlaceholder = (row: object): row is GridPlaceholder => 'placeholderId' in row;

export const gridPlaceholderRows = (count: number): GridPlaceholder[] =>
    Array.from({ length: count }, (_, index) => ({ placeholderId: `placeholder-${index}` }));

/** The columns, drawing a static skeleton bar for placeholder rows and their own cell otherwise. */
export const withGridPlaceholders = <T extends object>(
    columns: readonly DataGridColumn<T>[]
): DataGridColumn<T | GridPlaceholder>[] =>
    columns.map(
        column =>
            ({
                ...column,
                cell: (row: T | GridPlaceholder) =>
                    isGridPlaceholder(row) ? (
                        <Skeleton animationType="none" className="grid-placeholder" />
                    ) : (
                        column.cell?.(row, column)
                    ),
            }) as DataGridColumn<T | GridPlaceholder>
    );
