import {
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from '@tanstack/react-table';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createColumns } from '@/components/dashboard/recent-products/columns';
import { filterProducts, hydrateProducts } from '@/components/dashboard/recent-products/filter-utils';
import { ProductHistorySheet } from '@/components/dashboard/recent-products/history-sheet';
import { RecentProductsTableView } from '@/components/dashboard/recent-products/table-view';
import {
	ProductTooltipPortal,
	useProductTooltip,
} from '@/components/dashboard/recent-products/tooltip';
import type {
	FilterState,
	SelectedHistoryProduct,
} from '@/components/dashboard/recent-products/types';
import { api } from '@/lib/trpc';

export function RecentProducts({
	filters,
	searchValue,
	onStatusChange,
}: {
	filters: FilterState;
	searchValue: string;
	onStatusChange?: (info: { count: number; hasMore: boolean }) => void;
}) {
	const deferredSearchValue = useDeferredValue(searchValue.trim());
	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
		api.api.app.recentProducts.useInfiniteQuery(
			{
				limit: 50,
				search: deferredSearchValue.length > 0 ? deferredSearchValue : undefined,
			},
			{
				getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			},
		);

	const [sorting, setSorting] = useState<SortingState>([
		{ desc: false, id: 'lastFetched' },
	]);
	const [selectedHistoryProduct, setSelectedHistoryProduct] =
		useState<SelectedHistoryProduct | null>(null);
	const [isHistorySheetOpen, setIsHistorySheetOpen] = useState(false);
	const loadMoreRef = useRef<HTMLDivElement>(null);
	const deferredFilters = useDeferredValue(filters);

	const {
		hideTooltip,
		queueTooltipPositionUpdate,
		setTooltip,
		tooltip,
		tooltipRef,
	} = useProductTooltip();

	const products = useMemo(
		() => hydrateProducts(data?.pages.flatMap((page) => page.items) ?? []),
		[data],
	);

	const filteredProducts = useMemo(
		() =>
			filterProducts({
				filters: deferredFilters,
				products,
			}),
		[deferredFilters, products],
	);

	useEffect(() => {
		onStatusChange?.({ count: filteredProducts.length, hasMore: hasNextPage ?? false });
	}, [filteredProducts.length, hasNextPage, onStatusChange]);

	const selectedHistoryKey = selectedHistoryProduct
		? `${selectedHistoryProduct.marketplaceId}:${selectedHistoryProduct.asin}`
		: null;

	const handleSelectHistory = useCallback((product: SelectedHistoryProduct) => {
		setSelectedHistoryProduct(product);
		setIsHistorySheetOpen(true);
	}, []);

	const columns = useMemo(
		() =>
			createColumns({
				onSelectHistory: handleSelectHistory,
				selectedHistoryKey,
			}),
		[handleSelectHistory, selectedHistoryKey],
	);

	const colgroupColumns = useMemo(
		() =>
			columns.map((column, index) => {
				const meta = column.meta as { flex?: boolean } | undefined;
				const key =
					(typeof column.id === 'string' && column.id) ||
					(typeof column.accessorKey === 'string' && column.accessorKey) ||
					`column-${index}`;
				return { key, width: meta?.flex ? undefined : column.size };
			}),
		[columns],
	);

	useEffect(() => {
		if (!hasNextPage || isFetchingNextPage) {
			return;
		}

		const node = loadMoreRef.current;
		if (!node) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const [entry] = entries;
				if (!entry?.isIntersecting || !hasNextPage || isFetchingNextPage) {
					return;
				}
				fetchNextPage();
			},
			{ rootMargin: '240px 0px' },
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	const table = useReactTable({
		columns,
		data: filteredProducts,
		enableSortingRemoval: false,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onSortingChange: setSorting,
		state: { sorting },
	});

	if (isLoading) {
		return (
			<div className="h-full bg-card">
				<div className="space-y-1 p-3">
					{Array.from({ length: 10 }).map((_, index) => (
						<div key={index} className="bg-muted h-8 animate-pulse rounded-sm" />
					))}
				</div>
			</div>
		);
	}

	return (
		<>
			<RecentProductsTableView
				table={table}
				colgroupColumns={colgroupColumns}
				columnsCount={columns.length}
				selectedHistoryKey={selectedHistoryKey}
				hasNextPage={Boolean(hasNextPage)}
				isFetchingNextPage={isFetchingNextPage}
				loadMoreRef={loadMoreRef}
				onRowMouseEnter={({ event, imageUrl, title, asin }) => {
					if (!imageUrl) {
						return;
					}
					queueTooltipPositionUpdate(event.clientX, event.clientY);
					setTooltip({ url: imageUrl, title: title ?? asin });
				}}
				onRowMouseMove={({ event, imageUrl }) => {
					if (!imageUrl) {
						return;
					}
					queueTooltipPositionUpdate(event.clientX, event.clientY);
				}}
				onRowMouseLeave={hideTooltip}
			/>
			<ProductTooltipPortal tooltip={tooltip} tooltipRef={tooltipRef} />
			<ProductHistorySheet
				isOpen={isHistorySheetOpen}
				selectedProduct={selectedHistoryProduct}
				onOpenChange={(open) => {
					setIsHistorySheetOpen(open);
					if (!open) {
						setSelectedHistoryProduct(null);
					}
				}}
			/>
		</>
	);
}

export type { FilterState } from '@/components/dashboard/recent-products/types';
