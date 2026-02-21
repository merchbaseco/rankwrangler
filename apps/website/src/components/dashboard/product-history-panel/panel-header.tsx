import { Check, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { ProductHistoryPanelProduct } from '@/components/dashboard/product-history-panel/types';
import { cn } from '@/lib/utils';

export const PanelHeader = ({
	product,
	onSync,
	isSyncing,
}: {
	product: ProductHistoryPanelProduct;
	onSync: () => void;
	isSyncing: boolean;
}) => {
	const [copied, setCopied] = useState(false);
	const amazonUrl = `https://www.amazon.com/dp/${product.asin}`;

	const handleCopyAsin = () => {
		navigator.clipboard.writeText(product.asin);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div className="flex gap-3.5 px-5 pb-3 pt-5">
			{product.thumbnailUrl ? (
				<div
					className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white"
					style={{ width: 56, aspectRatio: '4/5' }}
				>
					<img
						src={product.thumbnailUrl}
						alt=""
						className="h-[200%] w-[200%] max-w-none object-contain"
					/>
				</div>
			) : (
				<div
					className="bg-muted/40 flex shrink-0 items-center justify-center rounded-lg border border-border"
					style={{ width: 56, aspectRatio: '4/5' }}
				>
					<span className="text-muted-foreground text-lg">?</span>
				</div>
			)}
			<div className="min-w-0 flex-1">
				<h2 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
					{product.title ?? 'Untitled product'}
				</h2>
				{product.brand ? <p className="mt-0.5 text-xs text-muted-foreground">{product.brand}</p> : null}
				<div className="mt-1.5 flex items-center gap-2">
					<span className="font-mono text-xs text-muted-foreground">{product.asin}</span>
					<button
						type="button"
						onClick={handleCopyAsin}
						className="inline-flex items-center rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						title="Copy ASIN"
					>
						{copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
					</button>
					<a
						href={amazonUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						title="View on Amazon"
					>
						<ExternalLink className="size-3.5" />
					</a>
					<button
						type="button"
						onClick={onSync}
						disabled={isSyncing}
						className={cn(
							'ml-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
							isSyncing
								? 'cursor-not-allowed text-muted-foreground'
								: 'text-muted-foreground hover:bg-accent hover:text-foreground',
						)}
					>
						{isSyncing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
						{isSyncing ? 'Syncing...' : 'Sync'}
					</button>
				</div>
			</div>
		</div>
	);
};
