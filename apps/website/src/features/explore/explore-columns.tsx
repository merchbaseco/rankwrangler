import type { DataGridColumn, DataGridSortDescriptor } from '@heroui-pro/react';
import { gridColumn } from '@/features/grid/grid-column';
import {
    AgeCell,
    BsrCell,
    DesignCell,
    DropsCell,
    MoveCell,
    NicheCell,
    PriceCell,
    RankCell,
    SoldCell,
    SparkCell,
} from './explore-cells';
import type { ExploreSort } from './explore-filters';
import type { ExploreRow } from './explore-rows';

/**
 * The ranked grid's columns in Grid J's order. Widths are theme tokens
 * (`--col-*`, set per column class in grid.css) so the KPI cells above span
 * exactly their column groups; `grid-col--wide` columns go below 80rem and
 * `grid-col--secondary` ones on phones. BSR, Sold/mo and Age sort on the
 * server (each one way, best first), like the sidebar's Sort select.
 */
export const exploreColumns: DataGridColumn<ExploreRow>[] = [
    gridColumn<ExploreRow>('rank', '#', row => <RankCell row={row} />, { align: 'end' }),
    gridColumn<ExploreRow>('design', 'Design', row => <DesignCell row={row} />, {
        isRowHeader: true,
    }),
    gridColumn<ExploreRow>('niche', 'Niche', row => <NicheCell row={row} />, { priority: 'wide' }),
    gridColumn<ExploreRow>('bsr', 'BSR', row => <BsrCell row={row} />, { allowsSorting: true }),
    gridColumn<ExploreRow>('spark', '30d', row => <SparkCell row={row} />, {
        priority: 'secondary',
    }),
    gridColumn<ExploreRow>('d7', '7d', row => <MoveCell move={row.delta7d} />, {
        align: 'end',
        priority: 'secondary',
    }),
    gridColumn<ExploreRow>('sold', 'Sold/mo', row => <SoldCell row={row} />, {
        allowsSorting: true,
        priority: 'secondary',
    }),
    gridColumn<ExploreRow>('drops', 'Drops', row => <DropsCell row={row} />, {
        align: 'end',
        priority: 'wide',
    }),
    gridColumn<ExploreRow>('age', 'Age', row => <AgeCell row={row} />, {
        align: 'end',
        allowsSorting: true,
        priority: 'secondary',
    }),
    gridColumn<ExploreRow>('price', 'Price', row => <PriceCell row={row} />, {
        align: 'end',
        priority: 'secondary',
    }),
];

/** The header sort arrow for the active server sort (none for Recently updated). */
export const exploreSortDescriptor = (sort: ExploreSort): DataGridSortDescriptor | undefined => {
    const entry = Object.entries(sortColumns).find(([, value]) => value.sort === sort);
    return entry ? { column: entry[0], direction: entry[1].direction } : undefined;
};

/** The server sort a header press picks. */
export const exploreSortForColumn = (column: unknown): ExploreSort | null =>
    typeof column === 'string' && column in sortColumns
        ? sortColumns[column as keyof typeof sortColumns].sort
        : null;

const sortColumns = {
    age: { direction: 'ascending', sort: 'newest' },
    bsr: { direction: 'ascending', sort: 'bsr' },
    sold: { direction: 'descending', sort: 'sold' },
} as const satisfies Record<string, { direction: 'ascending' | 'descending'; sort: ExploreSort }>;
