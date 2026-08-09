import type { ColumnDef } from "@tanstack/react-table";
import type {
	Product,
	SelectedHistoryProduct,
} from "@/components/dashboard/recent-products/types";
import { MerchListingBadge } from "@/components/dashboard/merch-listing-badge";
import { ProductAvailabilityBadge } from "@/components/dashboard/product-availability-badge";
import { MARKETPLACE_FLAGS } from "@/components/dashboard/recent-products/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductThumbnail as ProductThumbnailView } from "@/components/dashboard/product-thumbnail";
import { cn, formatCalendarDate, formatRelativeTime } from "@/lib/utils";

const RowBsrButton = ({
	bsr,
	asin,
	marketplaceId,
	title,
	thumbnail,
	brand,
	facets,
	dateFirstAvailable,
	rootCategoryBsr,
	rootCategoryDisplayName,
	isMerchListing,
	isUnavailable,
	freshness,
	isActive,
	onSelect,
}: {
	bsr: number | null;
	asin: string;
	marketplaceId: string;
	title: string | null;
	thumbnail: Product["thumbnail"];
	brand: string | null;
	facets: Array<{ facet: string; name: string }>;
	dateFirstAvailable: string | null;
	rootCategoryBsr: number | null;
	rootCategoryDisplayName: string | null;
	isMerchListing: boolean | null;
	isUnavailable: boolean;
	freshness: SelectedHistoryProduct["freshness"];
	isActive: boolean;
	onSelect: (product: SelectedHistoryProduct) => void;
}) => (
	<Button
		aria-label={isUnavailable ? "Open unavailable Product details" : "Open BSR history"}
		className="h-auto rounded-sm p-0 focus-visible:ring-1"
		onClick={() => {
			onSelect({
				asin,
				marketplaceId,
				title,
				thumbnail,
				brand,
				facets,
				dateFirstAvailable,
				rootCategoryBsr,
				rootCategoryDisplayName,
				isMerchListing,
				freshness,
			});
		}}
		size="sm"
		variant="ghost"
	>
		{isUnavailable ? (
			<ProductAvailabilityBadge
				className={cn(isActive && "bg-primary text-primary-foreground")}
				isUnavailable={true}
			/>
		) : (
			<Badge
				variant={getBsrBadgeVariant(bsr)}
				className={cn(
					"rounded-sm font-mono text-xs transition-colors",
					isActive && "bg-primary text-primary-foreground",
				)}
			>
				#{bsr?.toLocaleString()}
			</Badge>
		)}
	</Button>
);

export const createColumns = ({
	onSelectHistory,
	selectedHistoryKey,
}: {
	onSelectHistory: (product: SelectedHistoryProduct) => void;
	selectedHistoryKey: string | null;
}): ColumnDef<Product>[] => [
	{
		accessorKey: "thumbnail",
		cell: ({ row }) => {
			const thumbnail = row.getValue("thumbnail") as Product["thumbnail"];
			return (
				<ProductThumbnailView
					asin={row.original.asin}
					thumbnail={thumbnail}
					title={row.original.title}
				/>
			);
		},
		enableSorting: false,
		header: "",
		size: 50,
	},
	{
		accessorKey: "asin",
		cell: ({ row }) => (
			<div className="flex items-center gap-1.5">
				<span className="text-foreground font-mono text-xs">
					{row.getValue("asin")}
				</span>
				<MerchListingBadge
					className="rounded-sm px-1 py-0 text-[10px] leading-tight"
					value={row.original.isMerchListing}
				/>
			</div>
		),
		header: "ASIN",
		size: 150,
	},
	{
		accessorKey: "title",
		cell: ({ row }) => (
			<div className="min-w-0">
				<span className="line-clamp-1 text-xs font-medium text-foreground">
					{row.getValue("title") ?? "Untitled"}
				</span>
				<span className="text-muted-foreground line-clamp-1 text-xs">
					{row.original.brand ?? "No Brand"}
				</span>
			</div>
		),
		header: "Product",
		meta: { flex: true },
	},
	{
		accessorKey: "bullet1",
		cell: ({ row }) => (
			<span className="text-muted-foreground line-clamp-2 text-xs">
				{row.getValue("bullet1") ?? "--"}
			</span>
		),
		header: "Bullet 1",
		meta: { wrap: true },
		size: 280,
	},
	{
		accessorKey: "bullet2",
		cell: ({ row }) => (
			<span className="text-muted-foreground line-clamp-2 text-xs">
				{row.getValue("bullet2") ?? "--"}
			</span>
		),
		header: "Bullet 2",
		meta: { wrap: true },
		size: 280,
	},
	{
		accessorKey: "rootCategoryBsr",
		cell: ({ row }) => {
			const bsr = row.getValue("rootCategoryBsr") as number | null;
			if (bsr === null && !row.original.isUnavailable) {
				return <span className="text-muted-foreground text-xs">--</span>;
			}
			const rowKey = `${row.original.marketplaceId}:${row.original.asin}`;
			return (
				<div className="flex items-center justify-end">
					<RowBsrButton
						bsr={bsr}
						asin={row.original.asin}
						marketplaceId={row.original.marketplaceId}
						title={row.original.title}
						thumbnail={row.original.thumbnail}
						brand={row.original.brand}
						facets={row.original.facets}
						dateFirstAvailable={row.original.dateFirstAvailable}
						rootCategoryBsr={row.original.rootCategoryBsr}
						rootCategoryDisplayName={null}
						isMerchListing={row.original.isMerchListing}
						isUnavailable={row.original.isUnavailable}
						freshness={{ stale: false, updatedAt: row.original.updatedAt }}
						isActive={selectedHistoryKey === rowKey}
						onSelect={onSelectHistory}
					/>
				</div>
			);
		},
		header: "BSR",
		meta: { align: "right" },
		size: 120,
	},
	{
		accessorKey: "dateFirstAvailable",
		cell: ({ row }) => (
			<span className="text-muted-foreground whitespace-nowrap text-xs">
				{formatCalendarDate(
					row.getValue("dateFirstAvailable") as string | null,
				)}
			</span>
		),
		header: "Created",
		meta: { align: "right" },
		size: 110,
	},
	{
		accessorKey: "marketplaceId",
		cell: ({ row }) => {
			const marketplaceId = row.getValue("marketplaceId") as string;
			return (
				<span className="text-xs">
					{MARKETPLACE_FLAGS[marketplaceId] ?? marketplaceId}
				</span>
			);
		},
		header: "Mkt",
		meta: { align: "right" },
		size: 56,
	},
	{
		accessorKey: "updatedAt",
		cell: ({ row }) => (
			<span className="text-muted-foreground whitespace-nowrap font-mono text-xs">
				{formatRelativeTime(row.getValue("updatedAt"))}
			</span>
		),
		header: "Updated",
		invertSorting: true,
		meta: { align: "right" },
		size: 110,
	},
];

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
