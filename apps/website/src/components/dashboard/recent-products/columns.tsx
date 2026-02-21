import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import type {
	Product,
	SelectedHistoryProduct,
} from '@/components/dashboard/recent-products/types';
import { MARKETPLACE_FLAGS } from '@/components/dashboard/recent-products/types';
import { cn, formatRelativeTime } from '@/lib/utils';

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
}) => (
	<button
		type="button"
		onClick={() => {
			onSelect({ asin, marketplaceId, title, thumbnailUrl, brand });
		}}
		className={cn(
			'inline-flex h-6 items-center rounded-sm px-2 text-xs font-medium transition-colors',
			isActive
				? 'bg-primary text-primary-foreground'
				: 'hover:bg-accent border border-input bg-background text-foreground',
		)}
	>
		History
	</button>
);

export const createColumns = ({
	onSelectHistory,
	selectedHistoryKey,
}: {
	onSelectHistory: (product: SelectedHistoryProduct) => void;
	selectedHistoryKey: string | null;
}): ColumnDef<Product>[] => [
	{
		accessorKey: 'thumbnailUrl',
		cell: ({ row }) => {
			const url = row.getValue('thumbnailUrl') as string | null;
			return url ? (
				<div
					className="flex w-8 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted"
					style={{ aspectRatio: '4/5' }}
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
					style={{ aspectRatio: '4/5' }}
				>
					N/A
				</div>
			);
		},
		enableSorting: false,
		header: '',
		size: 50,
	},
	{
		accessorKey: 'asin',
		cell: ({ row }) => <span className="text-foreground font-mono text-xs">{row.getValue('asin')}</span>,
		header: 'ASIN',
		size: 120,
	},
	{
		accessorKey: 'title',
		cell: ({ row }) => (
			<div className="min-w-0">
				<span className="line-clamp-1 text-xs font-medium text-foreground">
					{row.getValue('title') ?? 'Untitled'}
				</span>
				<span className="text-muted-foreground line-clamp-1 text-xs">
					{row.original.brand ?? 'No Brand'}
				</span>
			</div>
		),
		header: 'Product',
		meta: { flex: true },
	},
	{
		accessorKey: 'rootCategoryBsr',
		cell: ({ row }) => {
			const bsr = row.getValue('rootCategoryBsr') as number | null;
			if (bsr === null) {
				return <span className="text-muted-foreground text-xs">--</span>;
			}
			return (
				<Badge variant={getBsrBadgeVariant(bsr)} className="rounded-sm font-mono text-xs">
					#{bsr.toLocaleString()}
				</Badge>
			);
		},
		header: 'BSR',
		meta: { align: 'right' },
		size: 120,
	},
	{
		accessorKey: 'marketplaceId',
		cell: ({ row }) => {
			const marketplaceId = row.getValue('marketplaceId') as string;
			return <span className="text-xs">{MARKETPLACE_FLAGS[marketplaceId] ?? marketplaceId}</span>;
		},
		header: 'Mkt',
		meta: { align: 'right' },
		size: 56,
	},
	{
		accessorKey: 'lastFetched',
		cell: ({ row }) => (
			<span className="text-muted-foreground whitespace-nowrap font-mono text-xs">
				{formatRelativeTime(row.getValue('lastFetched'))}
			</span>
		),
		header: 'Updated',
		invertSorting: true,
		meta: { align: 'right' },
		size: 86,
	},
	{
		id: 'history',
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
		header: '',
		meta: { align: 'right' },
		size: 88,
	},
];

export type ColgroupColumn = {
	key: string;
	width: number | undefined;
};

export const Colgroup = ({ columns }: { columns: ColgroupColumn[] }) => (
	<colgroup>
		{columns.map(({ key, width }) => (
			<col key={key} style={width ? { width, maxWidth: width } : undefined} />
		))}
	</colgroup>
);

const getBsrBadgeVariant = (bsr: number | null) => {
	if (bsr === null) {
		return 'outline' as const;
	}
	if (bsr <= 1000) {
		return 'success' as const;
	}
	if (bsr <= 10000) {
		return 'info' as const;
	}
	if (bsr <= 100000) {
		return 'warning' as const;
	}
	return 'outline' as const;
};
