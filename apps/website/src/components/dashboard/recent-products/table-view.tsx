import type { Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import {
	DashboardTable,
	type DashboardTableColumn,
	SortableTableHeader,
} from "@/components/dashboard/dashboard-table";
import type { Product } from "@/components/dashboard/recent-products/types";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const RecentProductsTableView = ({
	table,
	colgroupColumns,
	columnsCount,
	selectedHistoryKey,
	hasNextPage,
	isFetchingNextPage,
	loadMoreRef,
	emptyMessage = "No products scanned yet. Search an ASIN above.",
	onRowMouseEnter,
	onRowMouseMove,
	onRowMouseLeave,
}: {
	table: Table<Product>;
	colgroupColumns: DashboardTableColumn[];
	columnsCount: number;
	selectedHistoryKey: string | null;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	loadMoreRef: React.RefObject<HTMLDivElement | null>;
	emptyMessage?: string;
	onRowMouseEnter: (args: {
		event: React.MouseEvent<HTMLTableRowElement>;
		imageUrl: string | null;
		title: string | null;
		asin: string;
	}) => void;
	onRowMouseMove: (args: {
		event: React.MouseEvent<HTMLTableRowElement>;
		imageUrl: string | null;
	}) => void;
	onRowMouseLeave: () => void;
}) => (
	<DashboardTable
		afterTable={
			hasNextPage ? (
				<div ref={loadMoreRef} aria-hidden="true" className="h-1 w-full" />
			) : null
		}
		colgroupColumns={colgroupColumns}
		header={<SortableTableHeader table={table} />}
	>
		<TableBody>
			{table.getRowModel().rows.length ? (
				table.getRowModel().rows.map((row) => {
					const rowKey = `${row.original.marketplaceId}:${row.original.asin}`;
					const isSelectedRow = rowKey === selectedHistoryKey;

					return (
						<TableRow
							key={row.id}
							className={cn(isSelectedRow && "bg-accent hover:bg-accent")}
							onMouseEnter={(event) => {
								onRowMouseEnter({
									event,
									imageUrl: getThumbnailUrl(row.original.thumbnail),
									title: row.original.title,
									asin: row.original.asin,
								});
							}}
							onMouseMove={(event) => {
								onRowMouseMove({
									event,
									imageUrl: getThumbnailUrl(row.original.thumbnail),
								});
							}}
							onMouseLeave={onRowMouseLeave}
						>
							{row.getVisibleCells().map((cell) => {
								const meta = cell.column.columnDef.meta as
									| { align?: string; wrap?: boolean }
									| undefined;
								const isRight = meta?.align === "right";
								const isWrap = meta?.wrap === true;
								return (
									<TableCell
										key={cell.id}
										className={cn(
											isRight && "text-right",
											isWrap && "whitespace-normal",
										)}
									>
										{flexRender(
											cell.column.columnDef.cell,
											cell.getContext(),
										)}
									</TableCell>
								);
							})}
						</TableRow>
					);
				})
			) : (
				<TableRow>
					<TableCell
						className="text-muted-foreground h-24 text-center"
						colSpan={columnsCount}
					>
						{emptyMessage}
					</TableCell>
				</TableRow>
			)}

			{isFetchingNextPage
				? Array.from({ length: 3 }).map((_, index) => (
						<TableRow key={`loading-row-${index}`}>
							<TableCell colSpan={columnsCount}>
								<div className="bg-muted h-7 animate-pulse rounded-sm" />
							</TableCell>
						</TableRow>
					))
				: null}
		</TableBody>
	</DashboardTable>
);

const getThumbnailUrl = (thumbnail: Product["thumbnail"]) =>
	thumbnail.status === "available" ? thumbnail.url : null;
