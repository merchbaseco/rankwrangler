import {
	Check,
	Copy,
	ExternalLink,
	Loader2,
	RefreshCw,
	Tags,
} from "lucide-react";
import { useState } from "react";
import {
	FACET_CATEGORY_META,
	formatFacetValueLabel,
} from "@/components/dashboard/app/config";
import type { ProductHistoryPanelProduct } from "@/components/dashboard/product-history-panel/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveRelativeTime } from "@/hooks/use-live-relative-time";
import { cn, formatCalendarDate } from "@/lib/utils";

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
						{product.title ?? "Untitled product"}
					</h2>
					<p className="mt-0.5 text-[11px] text-muted-foreground">
						{[
							product.brand,
							product.dateFirstAvailable
								? formatCalendarDate(product.dateFirstAvailable)
								: null,
						]
							.filter(Boolean)
							.join(" · ") || "Unknown"}
					</p>
				</div>
			</div>

			{/* ASIN + metadata strip */}
			<div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-1.5">
				<span className="font-mono text-[11px] font-medium text-foreground">
					{product.asin}
				</span>
				<Tooltip>
					<TooltipTrigger
						nativeButton={false}
						render={
							<Button
								className="size-4 rounded-sm p-0 text-muted-foreground hover:text-foreground"
								onClick={handleCopyAsin}
								size="sm"
								variant="ghost"
							/>
						}
					>
						{copied ? (
							<Check className="size-3 text-emerald-600" />
						) : (
							<Copy className="size-3" />
						)}
					</TooltipTrigger>
					<TooltipPopup>{copied ? "Copied" : "Copy ASIN"}</TooltipPopup>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						nativeButton={false}
						render={
							<Button
								className="size-4 rounded-sm p-0 text-muted-foreground hover:text-foreground"
								render={
									<a
										href={amazonUrl}
										rel="noopener noreferrer"
										target="_blank"
									/>
								}
								size="sm"
								variant="ghost"
							/>
						}
					>
						<ExternalLink className="size-3" />
					</TooltipTrigger>
					<TooltipPopup>View on Amazon</TooltipPopup>
				</Tooltip>
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

			{/* Keepa + actions strip */}
			<div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-1.5">
				<SpApiStatusBadge
					productLastFetchedAt={product.productLastFetchedAt}
					rootCategoryBsr={product.rootCategoryBsr}
				/>
				<KeepaStatusButton
					isSyncing={isSyncing}
					isKeepaSyncStale={isKeepaSyncStale}
					keepaLastSyncAt={keepaLastSyncAt}
					onSync={onSync}
				/>
				{canFetchFacets ? (
					<>
						<div className="mx-0.5 h-3 w-px bg-border" />
						<Button
							className={cn(
								"h-auto rounded-sm px-0 py-0 font-mono text-[11px] font-medium",
								isFetchingFacets
									? "cursor-not-allowed text-muted-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={onFetchFacets}
							disabled={isFetchingFacets}
							size="sm"
							variant="ghost"
						>
							{isFetchingFacets ? (
								<Loader2 className="size-3 animate-spin" />
							) : (
								<Tags className="size-3" />
							)}
							{isFetchingFacets ? "Fetching facets..." : "Fetch facets"}
						</Button>
					</>
				) : null}
			</div>
		</div>
	);
};

const KeepaStatusButton = ({
	isSyncing,
	isKeepaSyncStale,
	keepaLastSyncAt,
	onSync,
}: {
	isSyncing: boolean;
	isKeepaSyncStale: boolean;
	keepaLastSyncAt: string | null;
	onSync: () => void;
}) => {
	const timestampLabel = useLiveRelativeTime(keepaLastSyncAt);

	if (isSyncing) {
		return (
			<Badge variant="secondary" size="sm" className="gap-1">
				<Loader2 className="size-3 animate-spin" />
				Syncing Keepa...
			</Badge>
		);
	}

	if (isKeepaSyncStale) {
		return (
			<Tooltip>
				<TooltipTrigger
					nativeButton={false}
					render={
						<button
							type="button"
							className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
							onClick={onSync}
						/>
					}
				>
					<RefreshCw className="size-3" />
					Keepa stale · {timestampLabel}
				</TooltipTrigger>
				<TooltipPopup>Click to sync from Keepa</TooltipPopup>
			</Tooltip>
		);
	}

	return (
		<Tooltip>
			<TooltipTrigger
				nativeButton={false}
				render={
					<button
						type="button"
						className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
						onClick={onSync}
					/>
				}
			>
				<RefreshCw className="size-3" />
				Keepa fresh · {timestampLabel}
			</TooltipTrigger>
			<TooltipPopup>Click to re-sync from Keepa</TooltipPopup>
		</Tooltip>
	);
};

const getSpApiRefreshThresholdMs = (bsr: number | null) => {
	if (bsr === null) return 48 * 60 * 60 * 1000;
	if (bsr < 200_000) return 24 * 60 * 60 * 1000;
	if (bsr < 500_000) return 3 * 24 * 60 * 60 * 1000;
	if (bsr < 1_000_000) return 7 * 24 * 60 * 60 * 1000;
	if (bsr < 3_000_000) return 14 * 24 * 60 * 60 * 1000;
	return 30 * 24 * 60 * 60 * 1000;
};

const SpApiStatusBadge = ({
	productLastFetchedAt,
	rootCategoryBsr,
}: {
	productLastFetchedAt: string | null;
	rootCategoryBsr: number | null;
}) => {
	const label = useLiveRelativeTime(productLastFetchedAt);
	if (!productLastFetchedAt) return null;

	const thresholdMs = getSpApiRefreshThresholdMs(rootCategoryBsr);
	const ageMs = Date.now() - new Date(productLastFetchedAt).getTime();
	const isStale = ageMs > thresholdMs;

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span
						className={cn(
							"inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[11px] font-medium",
							isStale
								? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
								: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
						)}
					/>
				}
			>
				{isStale ? "SP-API stale" : "SP-API fresh"} · {label}
			</TooltipTrigger>
			<TooltipPopup>
				Product data from Amazon SP-API
			</TooltipPopup>
		</Tooltip>
	);
};

export const formatFacetBadgeLabel = (facet: {
	facet: string;
	name: string;
}) => {
	const categoryLabel = FACET_CATEGORY_META[facet.facet]?.label ?? facet.facet;
	return `${categoryLabel}: ${formatFacetValueLabel(facet.name)}`;
};
