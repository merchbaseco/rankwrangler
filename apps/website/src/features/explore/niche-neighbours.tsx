import { Skeleton } from '@heroui/react';
import { DataGrid, type DataGridColumn } from '@heroui-pro/react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gridColumn } from '@/features/grid/grid-column';
import { GridRowLinks } from '@/features/grid/grid-row-links';
import {
    BsrCell,
    DesignCell,
    exploreRowAttribute,
    MoveCell,
    SoldCell,
    SparkCell,
} from './explore-cells';
import { type ExploreRow, toExploreRows } from './explore-rows';
import { productHref } from './product-links';
import { type ProductRowFilter, ProductRowMenu } from './product-row-menu';
import type { ExploreProduct } from './use-explore-products';

/**
 * The best-ranked designs sharing a niche, on the Product page: Explore's
 * own cells (art and name, tier figure, 30-day halftone, seven-day move,
 * sold a month) in the same hairline grid. A row opens its Product page;
 * right-click gives the product menu, whose filters open Explore narrowed to
 * the niche or brand.
 */
export const NicheNeighbours = ({
    isLoading,
    nicheLabel,
    products,
}: {
    isLoading: boolean;
    nicheLabel: string;
    products: readonly ExploreProduct[];
}) => {
    const navigate = useNavigate();
    const [now] = useState(() => Date.now());
    const rows = useMemo(() => toExploreRows(products, { now }), [products, now]);
    const openFilter = (filter: ProductRowFilter) =>
        navigate(`/explore?${new URLSearchParams(filter)}`);
    const hrefOf = (asin: string) => {
        const row = rows.find(candidate => candidate.asin === asin);
        return row ? productHref(row) : undefined;
    };
    const open = (asin: string) => {
        const href = hrefOf(asin);
        if (href) {
            navigate(href);
        }
    };
    return (
        <ProductRowMenu attribute={exploreRowAttribute} onFilter={openFilter} rows={rows}>
            <GridRowLinks hrefOf={hrefOf}>
                <DataGrid
                    aria-label={`Same niche: ${nicheLabel}`}
                    className="hairline-grid"
                    columns={columns}
                    data={rows}
                    getRowId={row => row.asin}
                    onRowAction={key => open(String(key))}
                    renderEmptyState={() =>
                        isLoading ? (
                            <Skeleton className="h-3 w-full rounded-xl" />
                        ) : (
                            <span className="text-muted">Nothing else in this niche yet.</span>
                        )
                    }
                    variant="secondary"
                />
            </GridRowLinks>
        </ProductRowMenu>
    );
};

const columns: DataGridColumn<ExploreRow>[] = [
    gridColumn<ExploreRow>(
        'design',
        'Design',
        row => (
            <span className="contents" {...{ [exploreRowAttribute]: row.asin }}>
                <DesignCell row={row} />
            </span>
        ),
        { isRowHeader: true }
    ),
    gridColumn<ExploreRow>('bsr', 'BSR', row => <BsrCell row={row} />),
    gridColumn<ExploreRow>('spark', '30d', row => <SparkCell row={row} />, {
        priority: 'secondary',
    }),
    gridColumn<ExploreRow>('d7', '7d', row => <MoveCell move={row.delta7d} />, { align: 'end' }),
    gridColumn<ExploreRow>('sold', 'Sold/mo', row => <SoldCell row={row} />, {
        priority: 'secondary',
    }),
];
