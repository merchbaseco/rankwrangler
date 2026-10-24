import {
	getCoreRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	FACET_CATEGORY_META,
	formatFacetValueLabel,
} from "@/components/dashboard/app/config";
import {
	ProductImageTooltip,
	useProductImageTooltip,
} from "@/components/dashboard/product-image-tooltip";
import { createColumns } from "@/components/dashboard/recent-products/columns";
import { toFacetKey } from "@/components/dashboard/recent-products/filter-utils";
import { ProductHistorySheet } from "@/components/dashboard/recent-products/history-sheet";
import { RecentProductsTableView } from "@/components/dashboard/recent-products/table-view";
import type {
	FilterState,
	SelectedHistoryProduct,
} from "@/components/dashboard/recent-products/types";
import { useProductSearch } from "@/components/dashboard/recent-products/use-product-search";

export function RecentProducts({
	activeFacetKeys,
	filters,
	searchValue,
	onStatusChange,
}: {
	activeFacetKeys: string[];
	filters: FilterState;
	searchValue: string;
	onStatusChange?: (info: {
		availableFacets: Array<{ emoji: string; key: string; label: string }>;
		count: number;
		hasMore: boolean;
		totalProducts: number | null;
		totalMerchProducts: number | null;
	}) => void;
}) {
	const [sorting, setSorting] = useState<SortingState>([
		{ desc: true, id: "updatedAt" },
	]);
	const {
		products, metadata, error, fetchNextPage, hasNextPage,
		isFetchingNextPage, isLoading,
	} = useProductSearch({ activeFacetKeys, filters, searchValue, sorting });
	const [selectedHistoryProduct, setSelectedHistoryProduct] =
		useState<SelectedHistoryProduct | null>(null);
	const [isHistorySheetOpen, setIsHistorySheetOpen] = useState(false);
	const loadMoreRef = useRef<HTMLDivElement>(null);

	const {
		onRowMouseEnter,
		onRowMouseLeave,
		onRowMouseMove,
		tooltip,
		tooltipRef,
	} = useProductImageTooltip();

	const availableFacetValues = metadata?.availableFacets ?? null;

	const availableFacets = useMemo(() => {
		if (availableFacetValues) {
			return availableFacetValues
				.map((facetValue) => {
					const key = toFacetKey(facetValue);
					const categoryMeta = FACET_CATEGORY_META[facetValue.facet] ?? {
						emoji: "🏷️",
						label: facetValue.facet,
					};
					return {
						key,
						emoji: categoryMeta.emoji,
						label: `${categoryMeta.label}: ${formatFacetValueLabel(facetValue.name)}`,
					};
				})
				.sort((a, b) => a.label.localeCompare(b.label));
		}

		const byKey = new Map<
			string,
			{ emoji: string; key: string; label: string }
		>();
		for (const product of products) {
			for (const facet of product.facets) {
				const key = toFacetKey(facet);
				if (byKey.has(key)) {
					continue;
				}
				const categoryMeta = FACET_CATEGORY_META[facet.facet] ?? {
					emoji: "🏷️",
					label: facet.facet,
				};
				byKey.set(key, {
					key,
					emoji: categoryMeta.emoji,
					label: `${categoryMeta.label}: ${formatFacetValueLabel(facet.name)}`,
				});
			}
		}
		return Array.from(byKey.values()).sort((a, b) =>
			a.label.localeCompare(b.label),
		);
	}, [availableFacetValues, products]);

	const trackedTotals = metadata?.trackedTotals ?? null;

	useEffect(() => {
		onStatusChange?.({
			availableFacets,
			count: products.length,
			hasMore: hasNextPage ?? false,
			totalMerchProducts: trackedTotals?.totalMerchProducts ?? null,
			totalProducts: trackedTotals?.totalProducts ?? null,
		});
	}, [
		availableFacets,
		products.length,
		hasNextPage,
		onStatusChange,
		trackedTotals,
	]);

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
					(typeof column.id === "string" && column.id) ||
					(typeof column.accessorKey === "string" && column.accessorKey) ||
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
			{ rootMargin: "240px 0px" },
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	const table = useReactTable({
		columns,
		data: products,
		enableSortingRemoval: false,
		getCoreRowModel: getCoreRowModel(),
		manualSorting: true,
		enableMultiSort: false,
		onSortingChange: setSorting,
		state: { sorting },
	});

	if (isLoading) {
		return (
			<div className="h-full bg-card">
				<div className="space-y-1 p-3">
					{Array.from({ length: 10 }).map((_, index) => (
						<div
							key={index}
							className="bg-muted h-8 animate-pulse rounded-sm"
						/>
					))}
				</div>
			</div>
		);
	}

	return (
		<>
			<RecentProductsTableView
				table={table}
				emptyMessage="No products match this search."
				errorMessage={error ? describeProductsError(error.data?.code) : null}
				colgroupColumns={colgroupColumns}
				columnsCount={columns.length}
				selectedHistoryKey={selectedHistoryKey}
				hasNextPage={Boolean(hasNextPage)}
				isFetchingNextPage={isFetchingNextPage}
				loadMoreRef={loadMoreRef}
				onRowMouseEnter={onRowMouseEnter}
				onRowMouseMove={onRowMouseMove}
				onRowMouseLeave={onRowMouseLeave}
			/>
			<ProductImageTooltip tooltip={tooltip} tooltipRef={tooltipRef} />
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

/**
 * A failed read is not an empty catalog. Reporting "No products scanned yet"
 * for a 401 sent people looking for missing data that was there all along, so
 * the reason the server gave is what the table says. Called only when the query
 * actually failed: a transport failure carries no `data`, and falling back to
 * the empty state there would reintroduce exactly the lie this removes.
 */
function describeProductsError(code: string | undefined): string {
	if (code === "UNAUTHORIZED") {
		return "Not authorized to load products — the server rejected this session.";
	}
	if (code === "FORBIDDEN") {
		return "RankWrangler access is not granted for this account.";
	}
	if (code === "SERVICE_UNAVAILABLE") {
		return "Access checks are temporarily unavailable. Retry shortly.";
	}
	return "Failed to load products.";
}

export type { FilterState } from "@/components/dashboard/recent-products/types";
