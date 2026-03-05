import type { Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import {
	Colgroup,
	type ColgroupColumn,
} from "@/components/dashboard/keywords/columns";
import type { SearchTermRow } from "@/components/dashboard/keywords/types";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
	colgroupColumns: ColgroupColumn[];
	columnsCount: number;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	isLoading: boolean;
	hasError: boolean;
	loadMoreRef: React.RefObject<HTMLDivElement | null>;
	selectedSearchTerm: string | null;
	onSelectSearchTerm: (searchTerm: string) => void;
}) => (
	<div className="flex h-full min-h-0 flex-col bg-card">
		<table className="w-full shrink-0 text-xs" style={{ tableLayout: "fixed" }}>
			<Colgroup columns={colgroupColumns} />
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
								<TableHead
									key={header.id}
									className={isRight ? "text-right" : undefined}
								>
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
										flexRender(
											header.column.columnDef.header,
											header.getContext(),
										)
									)}
								</TableHead>
							);
						})}
					</TableRow>
				))}
			</TableHeader>
		</table>

		<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
			<table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
				<Colgroup columns={colgroupColumns} />
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
									'cursor-pointer',
									selectedSearchTerm === row.original.searchTerm &&
										'bg-accent hover:bg-accent',
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
			</table>
			{hasNextPage ? (
				<div ref={loadMoreRef} aria-hidden="true" className="h-1 w-full" />
			) : null}
		</div>
	</div>
);
