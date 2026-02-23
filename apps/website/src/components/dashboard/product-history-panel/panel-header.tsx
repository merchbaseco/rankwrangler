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
        <div className="border-b border-border bg-card px-3 py-3">
            <div className="flex gap-3">
                {product.thumbnailUrl ? (
                    <div
                        className="flex shrink-0 items-center justify-center overflow-hidden border border-border bg-white"
                        style={{ width: 44, aspectRatio: '4/5' }}
                    >
                        <img
                            src={product.thumbnailUrl}
                            alt=""
                            className="h-[200%] w-[200%] max-w-none object-contain"
                        />
                    </div>
                ) : (
                    <div
                        className="flex shrink-0 items-center justify-center border border-border bg-muted/40"
                        style={{ width: 44, aspectRatio: '4/5' }}
                    >
                        <span className="text-lg text-muted-foreground">
                            ?
                        </span>
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
                        {product.title ?? 'Untitled product'}
                    </h2>
                    {product.brand ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {product.brand}
                        </p>
                    ) : null}
                    <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-medium text-foreground">
                            {product.asin}
                        </span>
                        <button
                            type="button"
                            onClick={handleCopyAsin}
                            className="inline-flex items-center p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                            title="Copy ASIN"
                        >
                            {copied ? (
                                <Check className="size-3 text-emerald-600" />
                            ) : (
                                <Copy className="size-3" />
                            )}
                        </button>
                        <a
                            href={amazonUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                            title="View on Amazon"
                        >
                            <ExternalLink className="size-3" />
                        </a>
                        <div className="mx-0.5 h-3 w-px bg-border" />
                        <button
                            type="button"
                            onClick={onSync}
                            disabled={isSyncing}
                            className={cn(
                                'inline-flex items-center gap-1 py-0.5 font-mono text-[11px] font-medium transition-colors',
                                isSyncing
                                    ? 'cursor-not-allowed text-muted-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {isSyncing ? (
                                <Loader2 className="size-3 animate-spin" />
                            ) : (
                                <RefreshCw className="size-3" />
                            )}
                            {isSyncing ? 'Syncing...' : 'Sync'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
