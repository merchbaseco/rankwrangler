import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveRelativeTime } from "@/hooks/use-live-relative-time";
import { cn } from "@/lib/utils";

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

export const ProductUpdatedBadge = ({
	productUpdatedAt,
	rootCategoryBsr,
}: {
	productUpdatedAt: string | null;
	rootCategoryBsr: number | null;
}) => {
	const label = useLiveRelativeTime(productUpdatedAt);
	if (!productUpdatedAt) return null;

	const thresholdMs = getProductRefreshThresholdMs(rootCategoryBsr);
	const ageMs = Date.now() - new Date(productUpdatedAt).getTime();
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
				{isStale ? "Product stale" : "Product fresh"} · {label}
			</TooltipTrigger>
			<TooltipPopup>Last update for this Product</TooltipPopup>
		</Tooltip>
	);
};

const getProductRefreshThresholdMs = (bsr: number | null) => {
	if (bsr === null) return 48 * 60 * 60 * 1000;
	if (bsr < 200_000) return 24 * 60 * 60 * 1000;
	if (bsr < 500_000) return 3 * 24 * 60 * 60 * 1000;
	if (bsr < 1_000_000) return 7 * 24 * 60 * 60 * 1000;
	if (bsr < 3_000_000) return 14 * 24 * 60 * 60 * 1000;
	return 30 * 24 * 60 * 60 * 1000;
};
