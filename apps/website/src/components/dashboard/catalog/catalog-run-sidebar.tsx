import { CalendarClock } from "lucide-react";
import type { CatalogRunMetadata } from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCalendarDate, formatRelativeTime } from "@/lib/utils";

export const CatalogRunSidebar = ({
	runs,
	selectedRunId,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	onSelectRun,
}: {
	runs: CatalogRunMetadata[];
	selectedRunId: string | null;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
	onSelectRun: (runId: string) => void;
}) => (
	<aside className="flex min-h-0 w-[230px] shrink-0 flex-col border-r border-border bg-sidebar">
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
						<Button
							key={run.id}
							className={cn(
								"mb-1 h-auto w-full justify-start rounded-sm border border-transparent px-3 py-2 text-left hover:bg-muted",
								selectedRunId === run.id &&
									"border-border bg-muted hover:bg-muted",
							)}
							onClick={() => onSelectRun(run.id)}
							variant="ghost"
						>
							<div className="flex w-full items-center justify-between gap-2">
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
								<span className="font-medium text-foreground">
									{run.trigger === "automatic"
										? "Automatic refresh"
										: "Requested search"}
								</span>{" "}· {run.resultCount}{" "}
								{run.resultCount === 1 ? "Product" : "Products"} ·{" "}
								{formatRelativeTime(run.sourceCompletedAt)}
							</div>
						</Button>
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
