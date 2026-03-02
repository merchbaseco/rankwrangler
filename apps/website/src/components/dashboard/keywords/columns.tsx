import type { ColumnDef } from "@tanstack/react-table";
import type { SearchTermRow } from "@/components/dashboard/keywords/types";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";

export const createColumns = (): ColumnDef<SearchTermRow>[] => [
	{
		accessorKey: "searchTerm",
		cell: ({ row }) => (
			<div className="flex min-w-0 items-center gap-2">
				<div className="min-w-0 flex-1">
					<span className="line-clamp-1 text-xs font-medium text-foreground">
						{row.getValue("searchTerm") as string}
					</span>
					<span className="line-clamp-1 text-[11px] text-muted-foreground">
						{row.original.merchReason}
					</span>
				</div>
				{row.original.isMerchRelevant ? (
					<Badge
						variant="success"
						className="shrink-0 rounded-sm px-1 py-0 text-[10px] leading-tight"
					>
						Merch
					</Badge>
				) : null}
			</div>
		),
		header: "Keyword",
		meta: { flex: true },
	},
	{
		accessorKey: "searchFrequencyRank",
		cell: ({ row }) => {
			const rank = row.getValue("searchFrequencyRank") as number;
			return (
				<Badge
					variant={getRankBadgeVariant(rank)}
					className="rounded-sm font-mono text-xs"
				>
					#{formatNumber(rank)}
				</Badge>
			);
		},
		header: "Rank",
		meta: { align: "right" },
		size: 120,
	},
	{
		accessorKey: "clickShareTop3Sum",
		cell: ({ row }) => {
			const value = row.getValue("clickShareTop3Sum") as number;
			return (
				<div className="flex items-center justify-end gap-2">
					<ShareBar value={value} />
					<span className="w-14 text-right font-mono text-xs text-muted-foreground">
						{formatShare(value)}
					</span>
				</div>
			);
		},
		header: "Click Share (Top 3)",
		meta: { align: "right" },
		size: 200,
	},
	{
		accessorKey: "conversionShareTop3Sum",
		cell: ({ row }) => {
			const value = row.getValue("conversionShareTop3Sum") as number;
			return (
				<div className="flex items-center justify-end gap-2">
					<ShareBar value={value} />
					<span className="w-14 text-right font-mono text-xs text-muted-foreground">
						{formatShare(value)}
					</span>
				</div>
			);
		},
		header: "Conv. Share (Top 3)",
		meta: { align: "right" },
		size: 200,
	},
	{
		accessorKey: "topRowsCount",
		cell: ({ row }) => (
			<span className="font-mono text-xs text-muted-foreground">
				{formatNumber(row.getValue("topRowsCount") as number)}
			</span>
		),
		header: "Rows",
		meta: { align: "right" },
		size: 80,
	},
];

export type ColgroupColumn = {
	key: string;
	width: number | undefined;
};

export const Colgroup = ({ columns }: { columns: ColgroupColumn[] }) => (
	<colgroup>
		{columns.map(({ key, width }) => (
			<col key={key} style={width ? { maxWidth: width, width } : undefined} />
		))}
	</colgroup>
);

const ShareBar = ({ value }: { value: number }) => {
	const percent = Math.min(value * 100, 100);
	if (percent < 0.01) {
		return <div className="h-1.5 w-16 rounded-full bg-muted" />;
	}
	return (
		<div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
			<div
				className="h-full rounded-full bg-chart-1/60"
				style={{ width: `${Math.max(percent, 2)}%` }}
			/>
		</div>
	);
};

const formatShare = (value: number) => `${(value * 100).toFixed(2)}%`;

const getRankBadgeVariant = (rank: number) => {
	if (rank <= 1000) {
		return "success" as const;
	}
	if (rank <= 10000) {
		return "info" as const;
	}
	if (rank <= 100000) {
		return "warning" as const;
	}
	return "outline" as const;
};
