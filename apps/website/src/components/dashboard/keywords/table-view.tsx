import type { Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import {
	DashboardTable,
	type DashboardTableColumn,
	SortableTableHeader,
} from "@/components/dashboard/dashboard-table";
import type { SearchTermRow } from "@/components/dashboard/keywords/types";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const KeywordsTableView = ({
	table,
	colgroupColumns,
	columnsCount,
	hasNextPage,
	isFetchingNextPage,
	isLoading,
	hasError,
	loadMoreRef,
	selectedSearchTerm,
	onSelectSearchTerm,
}: {
	table: Table<SearchTermRow>;
	colgroupColumns: DashboardTableColumn[];
	columnsCount: number;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	isLoading: boolean;
	hasError: boolean;
	loadMoreRef: React.RefObject<HTMLDivElement | null>;
	selectedSearchTerm: string | null;
	onSelectSearchTerm: (searchTerm: string) => void;
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
			{isLoading ? (
				<TableRow>
					<TableCell
						className="h-24 text-center text-muted-foreground"
						colSpan={columnsCount}
					>
						Loading search terms...
					</TableCell>
				</TableRow>
			) : hasError ? (
				<TableRow>
					<TableCell
						className="h-24 text-center text-destructive"
						colSpan={columnsCount}
					>
						Failed to load search terms.
					</TableCell>
				</TableRow>
			) : table.getRowModel().rows.length ? (
				table.getRowModel().rows.map((row) => (
					<TableRow
						key={row.id}
						className={cn(
							"cursor-pointer",
							selectedSearchTerm === row.original.searchTerm &&
								"bg-accent hover:bg-accent",
						)}
						onClick={() => onSelectSearchTerm(row.original.searchTerm)}
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
				))
			) : (
				<TableRow>
					<TableCell
						className="h-24 text-center text-muted-foreground"
						colSpan={columnsCount}
					>
						No search terms found for the current filters.
					</TableCell>
				</TableRow>
			)}

			{isFetchingNextPage
				? Array.from({ length: 3 }).map((_, index) => (
						<TableRow key={`loading-row-${index}`}>
							<TableCell colSpan={columnsCount}>
								<div className="h-7 animate-pulse rounded-sm bg-muted" />
							</TableCell>
						</TableRow>
					))
				: null}
		</TableBody>
	</DashboardTable>
);
