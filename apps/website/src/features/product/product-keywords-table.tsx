import { useMediaQuery } from '@heroui/react';
import { DataGrid, type DataGridColumn, EmptyState } from '@heroui-pro/react';
import { Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { Icon } from '@/components/ui/icon';
import { TopTenShelf } from '@/features/bsr/top-ten-shelf';
import { gridColumn } from '@/features/grid/grid-column';
import {
    gridPlaceholderRows,
    isGridPlaceholder,
    withGridPlaceholders,
} from '@/features/grid/grid-placeholders';
import { GridRowLinks } from '@/features/grid/grid-row-links';
import { FreshCell, MedianBsrCell, ScoreCell, WeeksCell } from '@/features/keywords/keyword-cells';
import { KeywordRowMenu, keywordRowAttribute } from './keyword-row-menu';
import { formatAgo } from './product-format';
import { exploreKeywordHref } from './product-keyword-links';
import type { ProductKeyword } from './use-product-keywords';

/**
 * Keywords whose mined search pages showed this product, in the Keywords
 * screen's grid (Grid I): standing score and heat, twelve weeks of score, the
 * Top 10 shelf with this design's block ringed, where this design placed, the
 * shelf's median BSR and fresh designs, and when it was last seen. A row
 * opens Explore's results for the keyword, like the Keywords screen;
 * right-click for the row menu. While loading it draws placeholder rows, like
 * Explore and Keywords. Narrow windows leave columns out of the list rather
 * than hiding them in CSS, since a hidden column still takes width under an
 * empty state: a product with no keywords keeps the loading table's columns.
 */
export const ProductKeywordsTable = ({
    asin,
    isLoading,
    keywords,
}: {
    /** This product, ringed on each shelf. */
    asin: string;
    isLoading: boolean;
    keywords: readonly ProductKeyword[];
}) => {
    const navigate = useNavigate();
    const isWide = useMediaQuery(wideQuery, { initializeWithValue: true });
    const isPhone = useMediaQuery(phoneQuery, { initializeWithValue: true });
    const columns = useMemo(
        () =>
            withGridPlaceholders(
                columnsFor(asin, keywords).filter(
                    column =>
                        (isWide || !wideColumns.has(String(column.id))) &&
                        !(isPhone && phoneHiddenColumns.has(String(column.id)))
                )
            ),
        [asin, isPhone, isWide, keywords]
    );
    const hrefOf = (id: string) => {
        const keyword = keywords.find(candidate => candidate.queryId === id);
        return keyword ? exploreKeywordHref(keyword.keyword) : undefined;
    };
    return (
        <KeywordRowMenu keywords={keywords}>
            <GridRowLinks hrefOf={hrefOf}>
                <DataGrid
                    aria-label="Keywords this product ranks for"
                    className="hairline-grid hairline-grid--fixed"
                    columns={columns}
                    data={isLoading ? gridPlaceholderRows(PLACEHOLDER_ROWS) : [...keywords]}
                    getRowId={row => (isGridPlaceholder(row) ? row.placeholderId : row.queryId)}
                    onRowAction={key => {
                        const href = hrefOf(String(key));
                        if (href) {
                            navigate(href);
                        }
                    }}
                    renderEmptyState={() => <KeywordsEmptyState />}
                    variant="secondary"
                />
            </GridRowLinks>
        </KeywordRowMenu>
    );
};

/** The screens.css breakpoints the other grids drop their `wide` and `secondary` columns at. */
const wideQuery = '(width >= 80rem)';
const phoneQuery = '(width < 48rem)';
/** A few stand-in rows: the section is the page's last, so fewer real ones move nothing. */
const PLACEHOLDER_ROWS = 4;
const wideColumns = new Set(['weeks', 'median', 'new', 'seen']);
const phoneHiddenColumns = new Set(['shelf']);

const columnsFor = (
    asin: string,
    keywords: readonly ProductKeyword[]
): DataGridColumn<ProductKeyword>[] => [
    gridColumn<ProductKeyword>(
        'rank',
        '#',
        keyword => (
            <span
                className="grid-figure grid-figure--muted"
                {...{ [keywordRowAttribute]: keyword.queryId }}
            >
                {keywords.indexOf(keyword) + 1}
            </span>
        ),
        { align: 'end' }
    ),
    gridColumn<ProductKeyword>(
        'keyword',
        'Keyword',
        keyword => (
            <CursorTooltip content={keyword.keyword} triggerClassName="flex min-w-0">
                <span className="keyword-cell" data-selectable-text>
                    {keyword.keyword}
                </span>
            </CursorTooltip>
        ),
        { isRowHeader: true }
    ),
    gridColumn<ProductKeyword>('score', 'Score', keyword => (
        <ScoreCell
            row={{ heat: keyword.tier, score: keyword.score, searchFrequencyRank: null }}
        />
    )),
    gridColumn<ProductKeyword>('weeks', '12 weeks', keyword => <WeeksCell row={keyword} />),
    gridColumn<ProductKeyword>(
        'shelf',
        'Top 10 shelf',
        keyword => (
            <TopTenShelf
                highlightAsin={asin}
                keyword={keyword.keyword}
                shelf={keyword.shelf}
                size="lg"
            />
        )
    ),
    gridColumn<ProductKeyword>('placement', 'This design', keyword => (
        <PlacementCell keyword={keyword} />
    )),
    gridColumn<ProductKeyword>(
        'median',
        'Median BSR',
        keyword => <MedianBsrCell medianBsr={keyword.medianBsr} />
    ),
    gridColumn<ProductKeyword>('new', 'New', keyword => <FreshCell value={keyword.freshCount} />, {
        align: 'end',
    }),
    gridColumn<ProductKeyword>(
        'seen',
        'Seen',
        keyword => (
            <span className="grid-figure grid-figure--muted">
                {formatAgo(keyword.lastObservedAt)}
            </span>
        ),
        { align: 'end' }
    ),
];

/** Where this design placed in the keyword's newest search, `#2 p1`; a dash when it was not seen. */
const PlacementCell = ({ keyword }: { keyword: ProductKeyword }) =>
    keyword.position === null ? (
        <CursorTooltip content="Not in the newest search pages" triggerClassName="inline-flex">
            <span className="grid-figure grid-figure--muted">—</span>
        </CursorTooltip>
    ) : (
        <span className="grid-figure">
            #{keyword.position}
            {keyword.page === null ? null : <span className="text-muted"> p{keyword.page}</span>}
        </span>
    );

const KeywordsEmptyState = () => (
    <EmptyState size="sm">
        <EmptyState.Header>
            <EmptyState.Media variant="icon">
                <Icon icon={Search01Icon} />
            </EmptyState.Media>
            <EmptyState.Title>No keywords yet</EmptyState.Title>
            <EmptyState.Description>
                This design has not appeared on a mined search page.
            </EmptyState.Description>
        </EmptyState.Header>
    </EmptyState>
);
