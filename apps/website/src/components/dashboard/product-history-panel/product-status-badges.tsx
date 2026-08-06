import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveRelativeTime } from "@/hooks/use-live-relative-time";
import type { ProductFreshness } from "@/components/dashboard/product-history-panel/types";

export const KeepaStatusButton = ({
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
				Syncing Keepa…
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

export const ProductFreshnessButton = ({
	freshness,
	isRefreshing,
	refreshError,
	onRefresh,
}: {
	freshness: ProductFreshness;
	isRefreshing: boolean;
	refreshError: string | null;
	onRefresh: () => void;
}) => {
	const label = useLiveRelativeTime(freshness.updatedAt);
	const buttonLabel = isRefreshing ? "Refreshing…" : refreshError ? "Retry" : "Refresh";

	return (
		<div className="flex items-center gap-1.5">
			<span className="rounded-sm border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
				Product updated · {label}
			</span>
			<Button
				aria-label={buttonLabel}
				className="h-auto rounded-sm px-1 py-0 font-mono text-[11px] font-medium text-muted-foreground hover:text-foreground"
				disabled={isRefreshing}
				onClick={onRefresh}
				size="sm"
				title={refreshError ?? "Refresh Product details"}
				variant="ghost"
			>
				{isRefreshing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
				{buttonLabel}
			</Button>
		</div>
	);
};
