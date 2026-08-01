import { CalendarClock, Radio } from "lucide-react";
import type { CatalogQuery, CatalogRunMetadata } from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCalendarDate, formatRelativeTime } from "@/lib/utils";

export const CatalogRunSidebar = ({
	query,
	runs,
	selectedRunId,
	trackingError,
	trackingPending,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	onSelectRun,
	onSetTracking,
}: {
	query: CatalogQuery | null;
	runs: CatalogRunMetadata[];
	selectedRunId: string | null;
	trackingError: string | null;
	trackingPending: boolean;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
	onSelectRun: (runId: string) => void;
	onSetTracking: (enabled: boolean) => void;
}) => (
	<aside className="flex min-h-0 w-64 shrink-0 flex-col border-r border-border bg-card">
		<div className="border-b border-border p-4">
			<div className="flex items-center gap-2">
				<Radio className="size-4 text-muted-foreground" />
				<span className="text-xs font-medium uppercase tracking-wide">
					Weekly tracking
				</span>
			</div>
			<p className="mt-2 text-xs text-muted-foreground">
				{query?.tracking.enabled
					? `Enabled ${formatRelativeTime(query.tracking.trackedAt)}`
					: "Off until you explicitly enable it."}
			</p>
			<Button
				className="mt-3 w-full rounded-sm"
				disabled={!query || trackingPending}
				onClick={() => onSetTracking(!query?.tracking.enabled)}
				size="xs"
				variant={query?.tracking.enabled ? "outline" : "secondary"}
			>
				{trackingPending
					? "Saving…"
					: query?.tracking.enabled
						? "Stop tracking"
						: "Track weekly"}
			</Button>
			{trackingError ? (
				<p className="mt-2 text-xs text-destructive">{trackingError}</p>
			) : null}
		</div>

		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center gap-2 border-b border-border px-4 py-3">
				<CalendarClock className="size-4 text-muted-foreground" />
				<span className="text-xs font-medium uppercase tracking-wide">
					Run history
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				{runs.length ? (
					runs.map((run, index) => (
						<button
							key={run.id}
							className={cn(
								"mb-1 w-full rounded-sm border border-transparent px-3 py-2 text-left transition-colors hover:bg-muted",
								selectedRunId === run.id &&
									"border-border bg-muted hover:bg-muted",
							)}
							onClick={() => onSelectRun(run.id)}
							type="button"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="text-xs font-medium">
									{formatCalendarDate(run.sourceCompletedAt)}
								</span>
								{index === 0 ? (
									<Badge className="rounded-sm px-1 py-0 text-[9px]" variant="info">
										Latest
									</Badge>
								) : null}
							</div>
							<div className="mt-1 text-[11px] text-muted-foreground">
								{run.resultCount} {run.resultCount === 1 ? "Product" : "Products"} ·{" "}
								{formatRelativeTime(run.sourceCompletedAt)}
							</div>
						</button>
					))
				) : (
					<p className="p-3 text-xs text-muted-foreground">
						Successful runs will appear here.
					</p>
				)}
				{hasNextPage ? (
					<Button
						className="mt-1 w-full rounded-sm"
						disabled={isFetchingNextPage}
						onClick={onLoadMore}
						size="xs"
						type="button"
						variant="outline"
					>
						{isFetchingNextPage ? "Loading older runs…" : "Load older runs"}
					</Button>
				) : null}
			</div>
		</div>
	</aside>
);
