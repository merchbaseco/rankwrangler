import type { ColumnDef } from "@tanstack/react-table";
import type { SearchTermRow } from "@/components/dashboard/keywords/types";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";

export const createColumns = (): ColumnDef<SearchTermRow>[] => [
	{
		accessorKey: "searchTerm",
		cell: ({ row }) => (
			<span className="line-clamp-1 text-xs font-medium text-foreground">
				{row.getValue("searchTerm") as string}
			</span>
		),
		header: "Keyword",
		meta: { flex: true },
		enableSorting: false,
	},
	{
		accessorKey: "searchFrequencyRank",
		cell: ({ row }) => {
			const rank = row.getValue("searchFrequencyRank") as number;
			return (
				<Badge
					variant={getRankBadgeVariant(rank)}
					className="rounded-sm font-mono text-[10px]"
				>
					#{formatNumber(rank)}
				</Badge>
			);
		},
		header: "Rank",
		meta: { align: "right" },
		size: 112,
		enableSorting: false,
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
