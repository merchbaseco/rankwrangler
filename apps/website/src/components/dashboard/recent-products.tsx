import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ProductHistoryPanel } from "@/components/dashboard/product-history-panel";
import { Badge } from "@/components/ui/badge";

import { Sheet, SheetPanel, SheetPopup } from "@/components/ui/sheet";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/trpc";
import { cn, formatRelativeTime } from "@/lib/utils";

export type FilterState = {
	bsrRanges: Array<"top1k" | "top10k" | "top100k" | "100k+">;
	marketplaceIds: string[];
	lastUpdated: "all" | "24h" | "7d" | "30d";
};

const MARKETPLACE_FLAGS: Record<string, string> = {
	ATVPDKIKX0DER: "🇺🇸",
	A1F83G8C2ARO7P: "🇬🇧",
	A1PA6795UKMFR9: "🇩🇪",
	A13V1IB3VIYZZH: "🇫🇷",
	A1VC38T7YXB528: "🇯🇵",
};

const LAST_UPDATED_HOURS = {
	"24h": 24,
	"7d": 168,
	"30d": 720,
} as const;
const HOUR_IN_MS = 60 * 60 * 1000;
const TOOLTIP_WIDTH = 208;
const TOOLTIP_HEIGHT = 248;
const TOOLTIP_OFFSET = 14;

type Product = {
	asin: string;
	title: string | null;
	thumbnailUrl: string | null;
	brand: string | null;
	marketplaceId: string;
	rootCategoryBsr: number | null;
	lastFetched: string;
	lastFetchedMs: number;
};

type SelectedHistoryProduct = {
	asin: string;
	marketplaceId: string;
	title: string | null;
	thumbnailUrl: string | null;
	brand: string | null;
};

const RowHistoryButton = ({
	asin,
	marketplaceId,
	title,
	thumbnailUrl,
	brand,
	isActive,
	onSelect,
}: {
	asin: string;
	marketplaceId: string;
	title: string | null;
	thumbnailUrl: string | null;
	brand: string | null;
	isActive: boolean;
	onSelect: (product: SelectedHistoryProduct) => void;
}) => {
	return (
		<button
			type="button"
			onClick={() => {
				onSelect({ asin, marketplaceId, title, thumbnailUrl, brand });
			}}
			className={cn(
				"inline-flex h-6 items-center rounded-sm px-2 text-xs font-medium transition-colors",
				isActive
					? "bg-primary text-primary-foreground"
					: "hover:bg-accent border border-input bg-background text-foreground",
			)}
		>
			History
		</button>
	);
};

const getBsrBadgeVariant = (bsr: number | null) => {
	if (bsr === null) {
		return "outline" as const;
	}
	if (bsr <= 1000) {
		return "success" as const;
	}
	if (bsr <= 10000) {
		return "info" as const;
	}
	if (bsr <= 100000) {
		return "warning" as const;
	}
	return "outline" as const;
};

const createColumns = ({
	onSelectHistory,
	selectedHistoryKey,
}: {
	onSelectHistory: (product: SelectedHistoryProduct) => void;
	selectedHistoryKey: string | null;
}): ColumnDef<Product>[] => {
	return [
		{
			accessorKey: "thumbnailUrl",
			cell: ({ row }) => {
				const url = row.getValue("thumbnailUrl") as string | null;
				return url ? (
					<div
						className="flex w-8 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted"
						style={{ aspectRatio: "4/5" }}
					>
						<img
							src={url}
							alt={row.original.title ?? row.original.asin}
							className="h-full w-auto max-w-none"
						/>
					</div>
				) : (
					<div
						className="bg-muted text-muted-foreground flex w-8 items-center justify-center rounded-sm border border-border text-xs"
						style={{ aspectRatio: "4/5" }}
					>
						N/A
					</div>
				);
			},
			enableSorting: false,
			header: "",
			size: 50,
		},
		{
			accessorKey: "asin",
			cell: ({ row }) => (
				<span className="text-foreground font-mono text-xs">
					{row.getValue("asin")}
				</span>
			),
			header: "ASIN",
			size: 120,
		},
		{
			accessorKey: "title",
			cell: ({ row }) => {
				const brand = row.original.brand;
				return (
					<div className="min-w-0">
						<span className="line-clamp-1 text-xs font-medium text-foreground">
							{row.getValue("title") ?? "Untitled"}
						</span>
						<span className="text-muted-foreground line-clamp-1 text-xs">
							{brand ?? "No Brand"}
						</span>
					</div>
				);
			},
			header: "Product",
			meta: { flex: true },
		},
		{
			accessorKey: "rootCategoryBsr",
			cell: ({ row }) => {
				const bsr = row.getValue("rootCategoryBsr") as number | null;
				if (bsr === null) {
					return <span className="text-muted-foreground text-xs">--</span>;
				}
				return (
					<Badge variant={getBsrBadgeVariant(bsr)} className="rounded-sm font-mono text-xs">
						#{bsr.toLocaleString()}
					</Badge>
				);
			},
			header: "BSR",
			meta: { align: "right" },
			size: 120,
		},
		{
			accessorKey: "marketplaceId",
			cell: ({ row }) => {
				const id = row.getValue("marketplaceId") as string;
				return <span className="text-xs">{MARKETPLACE_FLAGS[id] ?? id}</span>;
			},
			header: "Mkt",
			meta: { align: "right" },
			size: 56,
		},
		{
			accessorKey: "lastFetched",
			cell: ({ row }) => (
				<span className="text-muted-foreground whitespace-nowrap font-mono text-xs">
					{formatRelativeTime(row.getValue("lastFetched"))}
				</span>
			),
			header: "Updated",
			invertSorting: true,
			meta: { align: "right" },
			size: 86,
		},
		{
			id: "history",
			cell: ({ row }) => {
				const rowKey = `${row.original.marketplaceId}:${row.original.asin}`;
				return (
					<div className="flex items-center justify-end">
						<RowHistoryButton
							asin={row.original.asin}
							marketplaceId={row.original.marketplaceId}
							title={row.original.title}
							thumbnailUrl={row.original.thumbnailUrl}
							brand={row.original.brand}
							isActive={selectedHistoryKey === rowKey}
							onSelect={onSelectHistory}
						/>
					</div>
				);
			},
			enableSorting: false,
			header: "",
			meta: { align: "right" },
			size: 88,
		},
	];
};

const Colgroup = ({ widths }: { widths: Array<number | undefined> }) => (
	<colgroup>
		{widths.map((width, index) => (
			<col key={index} style={width ? { width, maxWidth: width } : undefined} />
		))}
	</colgroup>
);

export function RecentProducts({
	filters,
	onStatusChange,
}: {
	filters: FilterState;
	onStatusChange?: (info: { count: number; hasMore: boolean }) => void;
}) {
	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
		api.api.app.recentProducts.useInfiniteQuery(
			{ limit: 50 },
			{
				getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			},
		);

	const [sorting, setSorting] = useState<SortingState>([
		{ desc: false, id: "lastFetched" },
	]);

	const [tooltip, setTooltip] = useState<{
		url: string;
		title: string;
	} | null>(null);
	const [selectedHistoryProduct, setSelectedHistoryProduct] =
		useState<SelectedHistoryProduct | null>(null);
	const [isHistorySheetOpen, setIsHistorySheetOpen] = useState(false);

	const loadMoreRef = useRef<HTMLDivElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const tooltipFrameRef = useRef<number | null>(null);
	const tooltipCursorRef = useRef({ x: 0, y: 0 });
	const deferredFilters = useDeferredValue(filters);

	const products = useMemo(
		() =>
			data?.pages.flatMap((page) =>
				page.items.map((product) => ({
					...product,
					lastFetchedMs: toValidTimestamp(product.lastFetched),
				})),
			) ?? [],
		[data],
	);

	const filteredProducts = useMemo(() => {
		const bsrRanges = deferredFilters.bsrRanges;
		const hasBsrFilter = bsrRanges.length > 0;
		const marketplaceIds = deferredFilters.marketplaceIds;
		const marketplaceSet =
			marketplaceIds.length > 0 ? new Set(marketplaceIds) : null;
		const lastUpdated = deferredFilters.lastUpdated;
		const cutoffMs =
			lastUpdated === "all" ? null : Date.now() - LAST_UPDATED_HOURS[lastUpdated] * HOUR_IN_MS;

		return products.filter((product) => {
			if (hasBsrFilter) {
				const bsr = product.rootCategoryBsr;
				const match = bsrRanges.some((range) => {
					if (bsr === null) return false;
					if (range === "top1k") return bsr <= 1000;
					if (range === "top10k") return bsr <= 10000;
					if (range === "top100k") return bsr <= 100000;
					return bsr > 100000;
				});
				if (!match) return false;
			}
			if (marketplaceSet && !marketplaceSet.has(product.marketplaceId)) {
				return false;
			}
			if (cutoffMs !== null && product.lastFetchedMs < cutoffMs) {
				return false;
			}
			return true;
		});
	}, [
		deferredFilters.bsrRanges,
		deferredFilters.lastUpdated,
		deferredFilters.marketplaceIds,
		products,
	]);

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

	const applyTooltipPosition = useCallback(() => {
		const node = tooltipRef.current;
		if (!node) {
			return;
		}

		const { x, y } = tooltipCursorRef.current;
		const position = getTooltipPosition({ cursorX: x, cursorY: y });
		node.style.transform = `translate3d(${position.left}px, ${position.top}px, 0)`;
	}, []);

	const queueTooltipPositionUpdate = useCallback(
		(cursorX: number, cursorY: number) => {
			tooltipCursorRef.current = { x: cursorX, y: cursorY };

			if (tooltipFrameRef.current !== null) {
				return;
			}

			tooltipFrameRef.current = window.requestAnimationFrame(() => {
				tooltipFrameRef.current = null;
				applyTooltipPosition();
			});
		},
		[applyTooltipPosition],
	);

	const handleRowMouseLeave = useCallback(() => {
		if (tooltipFrameRef.current !== null) {
			window.cancelAnimationFrame(tooltipFrameRef.current);
			tooltipFrameRef.current = null;
		}
		setTooltip(null);
	}, []);

	const columns = useMemo(
		() =>
			createColumns({
				onSelectHistory: handleSelectHistory,
				selectedHistoryKey,
			}),
		[handleSelectHistory, selectedHistoryKey],
	);

	const columnWidths = useMemo(
		() =>
			columns.map((column) => {
				const meta = column.meta as { flex?: boolean } | undefined;
				if (meta?.flex) {
					return undefined;
				}
				return column.size;
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
			{
				rootMargin: "240px 0px",
			},
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	useEffect(() => {
		if (!tooltip) {
			return;
		}
		applyTooltipPosition();
	}, [applyTooltipPosition, tooltip]);

	useEffect(() => {
		return () => {
			if (tooltipFrameRef.current !== null) {
				window.cancelAnimationFrame(tooltipFrameRef.current);
			}
		};
	}, []);

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
			<div className="flex h-full min-h-0 flex-col bg-card">
				<table className="w-full shrink-0 text-sm" style={{ tableLayout: "fixed" }}>
					<Colgroup widths={columnWidths} />
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow className="hover:bg-transparent" key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									const meta = header.column.columnDef.meta as
										| { align?: string }
										| undefined;
									const isRight = meta?.align === "right";
									const sortDirection = header.column.getIsSorted();
									return (
										<TableHead key={header.id} className={isRight ? "text-right" : undefined}>
											{header.isPlaceholder ? null : header.column.getCanSort() ? (
												<div
													className={cn(
														"flex h-full cursor-pointer select-none items-center gap-1",
														isRight ? "justify-end" : "justify-between",
													)}
													onClick={header.column.getToggleSortingHandler()}
													onKeyDown={(event) => {
														if (event.key === "Enter" || event.key === " ") {
															event.preventDefault();
															header.column.getToggleSortingHandler()?.(event);
														}
													}}
													role="button"
													tabIndex={0}
												>
													{flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
													{sortDirection === "asc" ? (
														<ChevronUpIcon
															aria-hidden="true"
															className="size-3.5 shrink-0 opacity-80"
														/>
													) : sortDirection === "desc" ? (
														<ChevronDownIcon
															aria-hidden="true"
															className="size-3.5 shrink-0 opacity-80"
														/>
													) : null}
												</div>
											) : (
												flexRender(header.column.columnDef.header, header.getContext())
											)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
				</table>

				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
					<table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
						<Colgroup widths={columnWidths} />
						<TableBody>
							{table.getRowModel().rows.length ? (
								table.getRowModel().rows.map((row) => {
									const rowKey = `${row.original.marketplaceId}:${row.original.asin}`;
									const isSelectedRow = rowKey === selectedHistoryKey;
									const imageUrl = row.original.thumbnailUrl;

									return (
										<TableRow
											key={row.id}
											className={cn(isSelectedRow && "bg-accent hover:bg-accent")}
											onMouseEnter={(event) => {
												if (!imageUrl) {
													return;
												}
												queueTooltipPositionUpdate(event.clientX, event.clientY);
												setTooltip({
													url: imageUrl,
													title: row.original.title ?? row.original.asin,
												});
											}}
											onMouseMove={(event) => {
												if (!imageUrl) {
													return;
												}
												queueTooltipPositionUpdate(event.clientX, event.clientY);
											}}
											onMouseLeave={handleRowMouseLeave}
										>
											{row.getVisibleCells().map((cell) => {
												const meta = cell.column.columnDef.meta as
													| { align?: string }
													| undefined;
												const isRight = meta?.align === "right";
												return (
													<TableCell
														key={cell.id}
														className={isRight ? "text-right" : undefined}
													>
														{flexRender(cell.column.columnDef.cell, cell.getContext())}
													</TableCell>
												);
											})}
										</TableRow>
									);
								})
							) : (
								<TableRow>
									<TableCell className="text-muted-foreground h-24 text-center" colSpan={columns.length}>
										No products scanned yet. Search an ASIN above.
									</TableCell>
								</TableRow>
							)}

							{isFetchingNextPage
								? Array.from({ length: 3 }).map((_, index) => (
										<TableRow key={`loading-row-${index}`}>
											<TableCell colSpan={columns.length}>
												<div className="bg-muted h-7 animate-pulse rounded-sm" />
											</TableCell>
										</TableRow>
									))
								: null}
						</TableBody>
					</table>

					{hasNextPage ? <div ref={loadMoreRef} aria-hidden="true" className="h-1 w-full" /> : null}
				</div>
			</div>

			{tooltip
				? createPortal(
						<div
							ref={tooltipRef}
							className="pointer-events-none fixed left-0 top-0 z-50 overflow-hidden rounded-sm border border-border bg-card shadow-md will-change-transform"
						>
							<img src={tooltip.url} alt={tooltip.title} className="block w-[188px]" />
						</div>,
						document.body,
					)
				: null}

			<Sheet
				open={isHistorySheetOpen}
				onOpenChange={(open) => {
					setIsHistorySheetOpen(open);
					if (!open) {
						setSelectedHistoryProduct(null);
					}
				}}
			>
				<SheetPopup side="right" variant="inset" className="p-0 sm:max-w-3xl">
					<SheetPanel className="h-full p-0">
						{selectedHistoryProduct ? (
							<ProductHistoryPanel key={selectedHistoryKey} product={selectedHistoryProduct} />
						) : null}
					</SheetPanel>
				</SheetPopup>
			</Sheet>
		</>
	);
}

const toValidTimestamp = (value: string) => {
	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getTooltipPosition = ({
	cursorX,
	cursorY,
}: {
	cursorX: number;
	cursorY: number;
}) => {
	const left =
		cursorX + TOOLTIP_WIDTH > window.innerWidth
			? cursorX - TOOLTIP_WIDTH
			: cursorX + TOOLTIP_OFFSET;
	const top =
		cursorY + TOOLTIP_HEIGHT > window.innerHeight
			? cursorY - TOOLTIP_HEIGHT
			: cursorY + TOOLTIP_OFFSET;
	return { left, top };
};
