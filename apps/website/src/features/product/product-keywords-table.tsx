import { Link, Skeleton } from '@heroui/react';
import { DataGrid, type DataGridColumn, EmptyState } from '@heroui-pro/react';
import { Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { formatCount } from '@/features/bsr/bsr-format';
import { tierClassName } from '@/features/bsr/bsr-tier';
import { PaneBar } from '@/features/shell/term-pane';
import { cn } from '@/lib/utils';
import { KeywordRowMenu, keywordRowAttribute } from './keyword-row-menu';
import { formatAgo } from './product-format';
import { keywordHref } from './product-keyword-links';
import type { ProductKeyword } from './use-product-keywords';

/**
 * Keywords whose mined search pages showed this product, as a section of the
 * Product pane over a hairline grid: where it placed, the keyword's standing score and heat, and when it
 * was last seen. The mock's "Search rank" column is replaced by the standing
 * score; Brand Analytics search frequency is retired. Right-click a row for
 * quick navigation.
 */
export const ProductKeywordsTable = ({
    isLoading,
    keywords,
    total,
}: {
    isLoading: boolean;
    keywords: readonly ProductKeyword[];
    total: number | null;
}) => (
    <section aria-label="Keywords" className="pane-section">
        <PaneBar title="Keywords">
            {total === null ? null : <span className="font-mono">{formatCount(total)}</span>}
        </PaneBar>
        {isLoading ? (
            <Skeleton className="h-24 w-full rounded-none" />
        ) : (
            <KeywordRowMenu keywords={keywords}>
                <DataGrid
                    aria-label="Keywords this product ranks for"
                    // Resize mode is what applies column widths (fixed layout); no column is resizable.
                    allowsColumnResize
                    className="hairline-grid"
                    variant="secondary"
                    columns={columns}
                    data={[...keywords]}
                    getRowId={keyword => keyword.queryId}
                    renderEmptyState={() => <KeywordsEmptyState />}
                />
            </KeywordRowMenu>
        )}
    </section>
);

/** Standing heat, inked with the nearest BSR tier (the Keywords screen's convention). */
const heatTiers = { cold: 'slow', hot: 'hot', warm: 'strong' } as const;
const heatLabels = { cold: 'Cold', hot: 'Hot', warm: 'Warm' } as const;

const columns: DataGridColumn<ProductKeyword>[] = [
    {
        cell: keyword => (
            <span {...{ [keywordRowAttribute]: keyword.queryId }}>
                <Link href={keywordHref(keyword.keyword)}>
                    <span className="font-sans font-semibold" data-selectable-text>
                        {keyword.keyword}
                    </span>
                </Link>
            </span>
        ),
        header: 'Keyword',
        id: 'keyword',
        allowsResizing: false,
        isRowHeader: true,
        minWidth: 180,
    },
    {
        cell: keyword =>
            keyword.position === null ? (
                <span className="text-muted">—</span>
            ) : (
                <span>
                    #{keyword.position}
                    {keyword.page === null ? null : (
                        <span className="text-muted"> p{keyword.page}</span>
                    )}
                </span>
            ),
        header: 'Rank',
        id: 'position',
        allowsResizing: false,
        width: 88,
    },
    {
        cell: keyword =>
            keyword.score === null || keyword.tier === 'unrated' ? (
                <span className="text-muted">Unrated</span>
            ) : (
                <span className="inline-flex items-center gap-1.5">
                    <span className="font-semibold">{Math.round(keyword.score)}</span>
                    <span className={cn('text-tier-fg', tierClassName(heatTiers[keyword.tier]))}>
                        {heatLabels[keyword.tier]}
                    </span>
                </span>
            ),
        header: 'Score',
        id: 'score',
        allowsResizing: false,
        width: 104,
    },
    {
        align: 'end',
        cell: keyword => <span className="text-muted">{formatAgo(keyword.lastObservedAt)}</span>,
        header: 'Seen',
        id: 'seen',
        allowsResizing: false,
        width: 72,
    },
];

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
