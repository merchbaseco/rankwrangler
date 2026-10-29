import type { DataGridColumn, DataGridSortDescriptor } from '@heroui-pro/react';
import { TopTenShelf } from '@/features/bsr/top-ten-shelf';
import { gridColumn } from '@/features/grid/grid-column';
import {
    CountCell,
    FreshCell,
    KeywordCell,
    KeywordRankCell,
    MedianBsrCell,
    ScoreCell,
    WeeksCell,
} from './keyword-cells';
import type { KeywordSort, RankedKeywordRow } from './keyword-model';
import { KeywordStatus } from './keyword-status';

type Row = RankedKeywordRow;

/**
 * The keyword grid's columns in Grid I's order. Widths are the `--col-*`
 * tokens (grid.css) the KPI cells above sum. Score, Median BSR, New and
 * Merch sort on the server, each one way (best first), like the sidebar's
 * Sort select; pressing the active header returns to Next to check.
 */
export const keywordColumns: DataGridColumn<Row>[] = [
    gridColumn<Row>('rank', '#', row => <KeywordRankCell row={row} />, { align: 'end' }),
    gridColumn<Row>('keyword', 'Keyword', row => <KeywordCell row={row} />, { isRowHeader: true }),
    gridColumn<Row>('score', 'Score', row => <ScoreCell row={row} />, { allowsSorting: true }),
    gridColumn<Row>('weeks', '12 weeks', row => <WeeksCell row={row} />, { priority: 'wide' }),
    gridColumn<Row>(
        'shelf',
        'Top 10 shelf',
        row => <TopTenShelf keyword={row.term} shelf={row.shelf} size="lg" />,
        { priority: 'secondary' }
    ),
    gridColumn<Row>('median', 'Median BSR', row => <MedianBsrCell medianBsr={row.medianBsr} />, {
        allowsSorting: true,
        priority: 'secondary',
    }),
    gridColumn<Row>('new', 'New', row => <FreshCell value={row.freshCount} />, {
        align: 'end',
        allowsSorting: true,
        priority: 'wide',
    }),
    gridColumn<Row>('merch', 'Merch', row => <CountCell value={row.merch} />, {
        align: 'end',
        allowsSorting: true,
        priority: 'secondary',
    }),
    gridColumn<Row>('status', 'Status', row => <KeywordStatus row={row} />, {
        priority: 'secondary',
    }),
];

export const keywordSortDescriptor = (sort: KeywordSort): DataGridSortDescriptor | undefined => {
    const entry = Object.entries(sortColumns).find(([, value]) => value.sort === sort);
    return entry ? { column: entry[0], direction: entry[1].direction } : undefined;
};

/** The sort a header press picks: its own, or back to Next to check when it is already active. */
export const keywordSortForColumn = (column: unknown, current: KeywordSort): KeywordSort | null => {
    if (typeof column !== 'string' || !(column in sortColumns)) {
        return null;
    }
    const sort = sortColumns[column as keyof typeof sortColumns].sort;
    return sort === current ? 'work' : sort;
};

const sortColumns = {
    median: { direction: 'ascending', sort: 'medianBsr' },
    merch: { direction: 'descending', sort: 'merch' },
    new: { direction: 'descending', sort: 'fresh' },
    score: { direction: 'descending', sort: 'score' },
} as const satisfies Record<string, { direction: 'ascending' | 'descending'; sort: KeywordSort }>;
