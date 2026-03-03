import { Check, Copy, ExternalLink, Loader2, RefreshCw, Tags } from 'lucide-react';
import { useState } from 'react';
import {
    FACET_CATEGORY_META,
    formatFacetValueLabel,
} from '@/components/dashboard/app/config';
import type { ProductHistoryPanelProduct } from '@/components/dashboard/product-history-panel/types';
import { Badge } from '@/components/ui/badge';
import { cn, formatCalendarDate, formatRelativeTime } from '@/lib/utils';

export const PanelHeader = ({
    product,
    onSync,
    onFetchFacets,
    isSyncing,
    isFetchingFacets,
    canFetchFacets,
    keepaLastSyncAt,
    isKeepaSyncStale,
}: {
    product: ProductHistoryPanelProduct;
    onSync: () => void;
    onFetchFacets: () => void;
    isSyncing: boolean;
    isFetchingFacets: boolean;
    canFetchFacets: boolean;
    keepaLastSyncAt: string | null;
    isKeepaSyncStale: boolean;
}) => {
    const [copied, setCopied] = useState(false);
    const amazonUrl = `https://www.amazon.com/dp/${product.asin}`;

    const handleCopyAsin = () => {
        navigator.clipboard.writeText(product.asin);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="border-b border-border bg-card">
            {/* Product identity */}
            <div className="flex gap-3 px-3 pt-3 pb-2.5">
                {product.thumbnailUrl ? (
                    <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-white">
                        <img
                            src={product.thumbnailUrl}
                            alt=""
                            className="size-full object-cover"
                        />
                    </div>
                ) : (
                    <div className="flex size-24 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/40">
                        <span className="text-lg text-muted-foreground">?</span>
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
                        {product.title ?? 'Untitled product'}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {[
                            product.brand,
                            product.dateFirstAvailable
                                ? formatCalendarDate(product.dateFirstAvailable)
                                : null,
                        ]
                            .filter(Boolean)
                            .join(' · ') || 'Unknown'}
                    </p>
                </div>
            </div>

            {/* ASIN + metadata strip */}
            <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-1.5">
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
                {product.isMerchListing ? (
                    <Badge variant="secondary" size="sm">
                        Merch
                    </Badge>
                ) : null}
                {product.rootCategoryBsr !== null ? (
                    <Badge variant="info" size="sm">
                        #{product.rootCategoryBsr.toLocaleString()}
                    </Badge>
                ) : null}
                {product.rootCategoryDisplayName ? (
                    <span className="truncate text-[11px] text-muted-foreground">
                        {product.rootCategoryDisplayName}
                    </span>
                ) : null}
            </div>

            {/* Facets strip */}
            {product.facets.length > 0 ? (
                <div className="flex items-start gap-2 border-t border-border/60 px-3 py-1.5">
                    <span className="pt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Facets
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                        {product.facets.map((facet) => (
                            <Badge
                                key={`${facet.facet}:${facet.name}`}
                                variant="outline"
                                size="sm"
                                className="max-w-full"
                            >
                                {formatFacetBadgeLabel(facet)}
                            </Badge>
                        ))}
                    </div>
                </div>
            ) : null}

            {/* Sync actions strip */}
            <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-1.5">
                <button
                    type="button"
                    onClick={onSync}
                    disabled={isSyncing}
                    className={cn(
                        'inline-flex items-center gap-1 font-mono text-[11px] font-medium transition-colors',
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
                <div className="mx-0.5 h-3 w-px bg-border" />
                {canFetchFacets ? (
                    <>
                        <button
                            type="button"
                            onClick={onFetchFacets}
                            disabled={isFetchingFacets}
                            className={cn(
                                'inline-flex items-center gap-1 font-mono text-[11px] font-medium transition-colors',
                                isFetchingFacets
                                    ? 'cursor-not-allowed text-muted-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {isFetchingFacets ? (
                                <Loader2 className="size-3 animate-spin" />
                            ) : (
                                <Tags className="size-3" />
                            )}
                            {isFetchingFacets ? 'Fetching facets...' : 'Fetch facets'}
                        </button>
                        <div className="mx-0.5 h-3 w-px bg-border" />
                    </>
                ) : null}
                <Badge variant={isKeepaSyncStale ? 'warning' : 'success'} size="sm">
                    {isKeepaSyncStale ? 'Keepa stale' : 'Keepa fresh'}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                    {keepaLastSyncAt ? formatRelativeTime(keepaLastSyncAt) : 'Never'}
                </span>
                {product.productLastFetchedAt ? (
                    <>
                        <div className="mx-0.5 h-3 w-px bg-border" />
                        <span className="text-[11px] text-muted-foreground">
                            Product: {formatRelativeTime(product.productLastFetchedAt)}
                        </span>
                    </>
                ) : null}
            </div>
        </div>
    );
};

export const formatFacetBadgeLabel = (facet: { facet: string; name: string }) => {
    const categoryLabel = FACET_CATEGORY_META[facet.facet]?.label ?? facet.facet;
    return `${categoryLabel}: ${formatFacetValueLabel(facet.name)}`;
};
