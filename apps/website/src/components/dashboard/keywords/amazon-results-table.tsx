import {
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from '@tanstack/react-table';
import { useMemo, useRef, useState } from 'react';
import { createColumns } from '@/components/dashboard/recent-products/columns';
import { hydrateProducts } from '@/components/dashboard/recent-products/filter-utils';
import { ProductHistorySheet } from '@/components/dashboard/recent-products/history-sheet';
import { RecentProductsTableView } from '@/components/dashboard/recent-products/table-view';
import {
	ProductTooltipPortal,
	useProductTooltip,
} from '@/components/dashboard/recent-products/tooltip';
import type {
	Product,
	SelectedHistoryProduct,
} from '@/components/dashboard/recent-products/types';

type AmazonSearchItem = Omit<Product, 'lastFetchedMs'>;

export const AmazonResultsTable = ({
	items,
	isLoading,
	errorMessage,
}: {
	items: AmazonSearchItem[];
	isLoading: boolean;
	errorMessage: string | null;
}) => {
	const [sorting, setSorting] = useState<SortingState>([
		{ desc: false, id: 'rootCategoryBsr' },
	]);
	const [selectedHistoryProduct, setSelectedHistoryProduct] =
		useState<SelectedHistoryProduct | null>(null);
	const [isHistorySheetOpen, setIsHistorySheetOpen] = useState(false);
	const loadMoreRef = useRef<HTMLDivElement>(null);

	const {
		hideTooltip,
		queueTooltipPositionUpdate,
		setTooltip,
		tooltip,
		tooltipRef,
	} = useProductTooltip();

	const hydrated = useMemo(() => hydrateProducts(items), [items]);

	const selectedHistoryKey = selectedHistoryProduct
		? `${selectedHistoryProduct.marketplaceId}:${selectedHistoryProduct.asin}`
		: null;

	const columns = useMemo(
		() =>
			createColumns({
				onSelectHistory: (product) => {
					setSelectedHistoryProduct(product);
					setIsHistorySheetOpen(true);
				},
				selectedHistoryKey,
			}),
		[selectedHistoryKey],
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

	const table = useReactTable<Product>({
		columns,
		data: hydrated,
		enableSortingRemoval: false,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onSortingChange: setSorting,
		state: { sorting },
	});

	if (isLoading) {
		return (
			<div className="bg-card space-y-1 p-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<div key={index} className="bg-muted h-8 animate-pulse rounded-sm" />
				))}
			</div>
		);
	}

	if (errorMessage) {
		return (
			<div className="text-destructive bg-card flex h-48 items-center justify-center px-4 text-sm">
				{errorMessage}
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
				hasNextPage={false}
				isFetchingNextPage={false}
				loadMoreRef={loadMoreRef}
				emptyMessage="No Amazon keyword results available for this term."
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
};
