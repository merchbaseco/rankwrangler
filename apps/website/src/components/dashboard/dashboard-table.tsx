import type { RowData, Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DashboardTableColumn = {
	key: string;
	width: number | undefined;
};

export const DashboardTable = ({
	afterTable,
	children,
	className,
	colgroupColumns,
	header,
	tableClassName,
}: {
	afterTable?: ReactNode;
	children: ReactNode;
	className?: string;
	colgroupColumns: DashboardTableColumn[];
	header: ReactNode;
	tableClassName?: string;
}) => (
	<div className={cn("flex h-full min-h-0 flex-col overflow-auto bg-card", className)}>
		<table
			className={cn("w-full text-sm", tableClassName)}
			style={{ tableLayout: "fixed" }}
		>
			<Colgroup columns={colgroupColumns} />
			{header}
			{children}
		</table>
		{afterTable}
	</div>
);

export const SortableTableHeader = <TData extends RowData>({
	table,
}: {
	table: Table<TData>;
}) => (
	<TableHeader className="sticky top-0 z-10 bg-card">
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
);

export const Colgroup = ({
	columns,
}: {
	columns: DashboardTableColumn[];
}) => (
	<colgroup>
		{columns.map(({ key, width }) => (
			<col key={key} style={width ? { maxWidth: width, width } : undefined} />
		))}
	</colgroup>
);
