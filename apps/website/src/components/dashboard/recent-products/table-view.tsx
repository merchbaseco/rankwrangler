import type { Table } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import {
	Colgroup,
	type ColgroupColumn,
} from '@/components/dashboard/recent-products/columns';
import type { Product } from '@/components/dashboard/recent-products/types';
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export const RecentProductsTableView = ({
	table,
	colgroupColumns,
	columnsCount,
	selectedHistoryKey,
	hasNextPage,
	isFetchingNextPage,
	loadMoreRef,
	emptyMessage = 'No products scanned yet. Search an ASIN above.',
	onRowMouseEnter,
	onRowMouseMove,
	onRowMouseLeave,
}: {
	table: Table<Product>;
	colgroupColumns: ColgroupColumn[];
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
	<div className="flex h-full min-h-0 flex-col bg-card">
		<table className="w-full shrink-0 text-sm" style={{ tableLayout: 'fixed' }}>
			<Colgroup columns={colgroupColumns} />
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => (
					<TableRow className="hover:bg-transparent" key={headerGroup.id}>
						{headerGroup.headers.map((header) => {
							const meta = header.column.columnDef.meta as
								| { align?: string }
								| undefined;
							const isRight = meta?.align === 'right';
							const sortDirection = header.column.getIsSorted();

							return (
								<TableHead key={header.id} className={isRight ? 'text-right' : undefined}>
									{header.isPlaceholder ? null : header.column.getCanSort() ? (
										<div
											className={cn(
												'flex h-full cursor-pointer select-none items-center gap-1',
												isRight ? 'justify-end' : 'justify-between',
											)}
											onClick={header.column.getToggleSortingHandler()}
											onKeyDown={(event) => {
												if (event.key === 'Enter' || event.key === ' ') {
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
											{sortDirection === 'asc' ? (
												<ChevronUpIcon
													aria-hidden="true"
													className="size-3.5 shrink-0 opacity-80"
												/>
											) : sortDirection === 'desc' ? (
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
			<table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
				<Colgroup columns={colgroupColumns} />
				<TableBody>
					{table.getRowModel().rows.length ? (
						table.getRowModel().rows.map((row) => {
							const rowKey = `${row.original.marketplaceId}:${row.original.asin}`;
							const isSelectedRow = rowKey === selectedHistoryKey;

							return (
								<TableRow
									key={row.id}
									className={cn(isSelectedRow && 'bg-accent hover:bg-accent')}
									onMouseEnter={(event) => {
										onRowMouseEnter({
											event,
											imageUrl: row.original.thumbnailUrl,
											title: row.original.title,
											asin: row.original.asin,
										});
									}}
									onMouseMove={(event) => {
										onRowMouseMove({ event, imageUrl: row.original.thumbnailUrl });
									}}
									onMouseLeave={onRowMouseLeave}
								>
									{row.getVisibleCells().map((cell) => {
										const meta = cell.column.columnDef.meta as
											| { align?: string; wrap?: boolean }
											| undefined;
										const isRight = meta?.align === 'right';
										const isWrap = meta?.wrap === true;
										return (
											<TableCell
												key={cell.id}
												className={cn(isRight && 'text-right', isWrap && 'whitespace-normal')}
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
							<TableCell className="text-muted-foreground h-24 text-center" colSpan={columnsCount}>
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
			</table>
			{hasNextPage ? <div ref={loadMoreRef} aria-hidden="true" className="h-1 w-full" /> : null}
		</div>
	</div>
);
