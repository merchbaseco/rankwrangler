import type { Selection } from '@heroui/react';
import { DataGrid, type DataGridSortDescriptor } from '@heroui-pro/react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GridDensityToggle } from '@/features/grid/grid-density-toggle';
import { GridPager } from '@/features/grid/grid-pager';
import {
    gridPlaceholderRows,
    isGridPlaceholder,
    withGridPlaceholders,
} from '@/features/grid/grid-placeholders';
import { GridRowLinks } from '@/features/grid/grid-row-links';
import { GridScreen } from '@/features/grid/grid-screen';
import { useRowCursor } from '@/features/shell/use-row-cursor';
import { exploreRowAttribute } from './explore-cells';
import { exploreColumns, exploreSortDescriptor, exploreSortForColumn } from './explore-columns';
import { clearedExploreFilters, isExploreFiltered, pageSizes } from './explore-filters';
import { ExploreKpis } from './explore-kpis';
import { ExploreEmpty } from './explore-placeholders';
import { toExploreRows } from './explore-rows';
import { ExploreSearch } from './explore-search';
import { ExploreSidebar } from './explore-sidebar';
import { amazonUrl, productHref } from './product-links';
import { type ProductRowFilter, ProductRowMenu } from './product-row-menu';
import { useExploreFacets } from './use-explore-facets';
import { useExploreFilters } from './use-explore-filters';
import { useExploreProducts } from './use-explore-products';

/**
 * Explore (`/explore`, Grid J/K): the filter sidebar, the KPI header over
 * its column groups, and one flat ranked page of `product.search` with a
 * pager. Filters, sort and page live in the URL. A click or ⏎ opens the
 * Product page; j/k move the row cursor, `a` opens Amazon, right-click opens
 * the row menu (open, Amazon, copy ASIN, filter to niche or brand).
 */
export const ExplorePage = () => {
    const navigate = useNavigate();
    const { filters, update } = useExploreFilters();
    const products = useExploreProducts(filters);
    const { facets } = useExploreFacets(filters);
    const [cursorAsin, setCursorAsin] = useState<string | null>(null);

    // Fixed per mount so ages do not tick between renders.
    const [now] = useState(() => Date.now());
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = useMemo(
        () => toExploreRows(products.products, { now, offset }),
        [products.products, now, offset]
    );
    const ids = useMemo(() => rows.map(row => row.asin), [rows]);
    const cursor = rows.some(row => row.asin === cursorAsin) ? cursorAsin : null;

    const hrefOf = useCallback(
        (asin: string) => {
            const row = rows.find(candidate => candidate.asin === asin);
            return row ? productHref(row) : undefined;
        },
        [rows]
    );
    const open = useCallback(
        (asin: string) => {
            const href = hrefOf(asin);
            if (href) {
                navigate(href);
            }
        },
        [hrefOf, navigate]
    );
    const openAmazon = useCallback(
        (asin: string) => {
            const row = rows.find(candidate => candidate.asin === asin);
            if (row) {
                window.open(amazonUrl(row), '_blank', 'noopener,noreferrer');
            }
        },
        [rows]
    );
    const keys = useMemo(() => ({ a: openAmazon }), [openAmazon]);
    useRowCursor({
        attribute: exploreRowAttribute,
        ids,
        keys,
        onOpen: open,
        onSelect: setCursorAsin,
        selectedId: cursor,
    });

    const handleSearch = useCallback((q: string) => update({ q }), [update]);
    const handleFilter = useCallback((filter: ProductRowFilter) => update(filter), [update]);
    const handleSortChange = ({ column }: DataGridSortDescriptor) => {
        const sort = exploreSortForColumn(column);
        if (sort) {
            update({ sort });
        }
    };
    const handleSelectionChange = (selection: Selection) => {
        const [first] = selection === 'all' ? [] : [...selection];
        setCursorAsin(first === undefined ? null : String(first));
    };
    const isFiltered = isExploreFiltered(filters);

    return (
        <GridScreen
            filters={<ExploreSidebar facets={facets} filters={filters} onChange={update} />}
            label="Explore"
        >
            <ExploreSearch onChange={handleSearch} value={filters.q} />
            <ExploreKpis facets={facets} filters={filters} onChange={update} rows={rows} />
            <ProductRowMenu
                attribute={exploreRowAttribute}
                fill
                onFilter={handleFilter}
                rows={rows}
            >
                <GridRowLinks hrefOf={hrefOf}>
                    <DataGrid
                        aria-label="Ranked designs"
                        className="hairline-grid hairline-grid--fixed hairline-grid--fill"
                        columns={columns}
                        data={products.isLoading ? gridPlaceholderRows(filters.pageSize) : rows}
                        getRowId={row => (isGridPlaceholder(row) ? row.placeholderId : row.asin)}
                        onRowAction={key => open(String(key))}
                        onSelectionChange={handleSelectionChange}
                        onSortChange={handleSortChange}
                        renderEmptyState={() => (
                            <ExploreEmpty
                                error={products.error}
                                onClear={isFiltered ? () => update(clearedExploreFilters) : null}
                            />
                        )}
                        scrollContainerClassName="overflow-y-auto"
                        selectedKeys={cursor ? new Set([cursor]) : new Set()}
                        // Toggle behaviour: a click (or ⏎) is the row action; j/k set the cursor.
                        selectionBehavior="toggle"
                        selectionMode="single"
                        sortDescriptor={exploreSortDescriptor(filters.sort)}
                        variant="secondary"
                    />
                </GridRowLinks>
            </ProductRowMenu>
            <GridPager
                extra={<GridDensityToggle />}
                isEstimate={products.totalIsEstimate}
                onPageChange={page => update({ page })}
                onPageSizeChange={pageSize => update({ pageSize })}
                page={filters.page}
                pageSize={filters.pageSize}
                pageSizes={pageSizes}
                rowCount={rows.length}
                total={products.total}
            />
        </GridScreen>
    );
};

const columns = withGridPlaceholders(exploreColumns);
