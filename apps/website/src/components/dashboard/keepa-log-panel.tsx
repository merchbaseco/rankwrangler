import { Loader2, RefreshCw } from "lucide-react";
import { api, type RouterOutputs } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Frame } from "@/components/ui/frame";

type KeepaLogPanelProps = {
	className?: string;
};

type KeepaLogData = RouterOutputs["api"]["app"]["keepaLog"];
type KeepaQueueItem = KeepaLogData["queue"]["items"][number];
type KeepaProcessedItem = KeepaLogData["processed"][number];

export function KeepaLogPanel({ className }: KeepaLogPanelProps) {
	const query = api.api.app.keepaLog.useQuery(
		{
			queueLimit: 250,
			processedLimit: 20,
		},
		{
			retry: false,
			refetchInterval: 15000,
			refetchOnWindowFocus: false,
		},
	);

	const errorCode = query.error?.data?.code;
	if (errorCode === "FORBIDDEN") {
		return null;
	}

	return (
		<div className={cn("shrink-0", className)}>
			<Frame>
				<div className="flex items-center justify-between border-b border-border px-3 py-2">
					<div>
						<p className="text-xs font-medium text-foreground">Keepa Log</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Queue snapshot and recent processed jobs
						</p>
					</div>
					<div className="flex items-center gap-2">
						{query.data ? (
							<Badge variant="secondary" className="h-4 rounded-sm px-1.5 text-xs">
								{query.data.queue.totalQueued} queued
							</Badge>
						) : null}
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 rounded-sm px-2"
							onClick={() => {
								void query.refetch();
							}}
							disabled={query.isFetching}
							aria-label="Refresh Keepa log"
						>
							{query.isFetching ? (
								<Loader2 className="size-3 animate-spin" />
							) : (
								<RefreshCw className="size-3" />
							)}
						</Button>
					</div>
				</div>

				{query.isLoading ? (
					<p className="px-3 py-3 text-sm text-muted-foreground">Loading Keepa log...</p>
				) : null}
				{errorCode === "UNAUTHORIZED" ? (
					<p className="px-3 py-3 text-sm text-warning-foreground">
						Session expired. Please sign out and back in.
					</p>
				) : null}
				{query.error && errorCode !== "UNAUTHORIZED" && errorCode !== "FORBIDDEN" ? (
					<p className="px-3 py-3 text-sm text-destructive">Failed to load Keepa log.</p>
				) : null}
				{!query.isLoading && !query.error && query.data ? (
					<div className="grid gap-3 p-3 lg:grid-cols-2">
						<QueueList queue={query.data.queue} />
						<ProcessedList processed={query.data.processed} />
					</div>
				) : null}
			</Frame>
		</div>
	);
}

const QueueList = ({ queue }: { queue: KeepaLogData["queue"] }) => {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
					Current Queue
				</p>
				<Badge variant="outline" size="sm">
					{queue.items.length}/{queue.totalQueued} shown
				</Badge>
			</div>
			{queue.items.length === 0 ? (
				<div className="rounded-sm border border-border bg-background px-2 py-3">
					<p className="text-xs text-muted-foreground">Queue is empty.</p>
				</div>
			) : (
				<div className="max-h-[340px] overflow-y-auto rounded-sm border border-border bg-background">
					{queue.items.map((item) => (
						<QueueItemRow key={item.id} item={item} />
					))}
				</div>
			)}
		</div>
	);
};

const QueueItemRow = ({ item }: { item: KeepaQueueItem }) => {
	return (
		<div className="border-b border-border px-2 py-2 last:border-b-0">
			<div className="flex items-center justify-between gap-2">
				<code className="truncate font-mono text-xs text-foreground">{item.asin}</code>
				<Badge
					variant={item.lastError ? "error" : item.attemptCount > 0 ? "warning" : "secondary"}
					size="sm"
				>
					attempt {item.attemptCount}
				</Badge>
			</div>
			<p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
				{item.marketplaceId}
			</p>
			<p className="mt-1 text-xs text-muted-foreground">
				Next: {formatRelativeFromNow(item.nextAttemptAt)} ({formatDateTime(item.nextAttemptAt)})
			</p>
			<p className="mt-0.5 text-xs text-muted-foreground">
				Queued: {formatDateTime(item.createdAt)}
			</p>
			{item.lastAttemptAt ? (
				<p className="mt-0.5 text-xs text-muted-foreground">
					Last attempt: {formatDateTime(item.lastAttemptAt)}
				</p>
			) : null}
			{item.lastError ? (
				<p className="mt-1 line-clamp-2 text-xs text-destructive">{item.lastError}</p>
			) : null}
		</div>
	);
};

const ProcessedList = ({ processed }: { processed: KeepaProcessedItem[] }) => {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
					Recent Processed
				</p>
				<Badge variant="outline" size="sm">
					{processed.length} rows
				</Badge>
			</div>
			{processed.length === 0 ? (
				<div className="rounded-sm border border-border bg-background px-2 py-3">
					<p className="text-xs text-muted-foreground">No processed Keepa jobs yet.</p>
				</div>
			) : (
				<div className="max-h-[340px] overflow-y-auto rounded-sm border border-border bg-background">
					{processed.map((item) => (
						<ProcessedItemRow key={item.id} item={item} />
					))}
				</div>
			)}
		</div>
	);
};

const ProcessedItemRow = ({ item }: { item: KeepaProcessedItem }) => {
	return (
		<div className="border-b border-border px-2 py-2 last:border-b-0">
			<div className="flex items-center justify-between gap-2">
				<code className="truncate font-mono text-xs text-foreground">
					{item.asin ?? "Unknown ASIN"}
				</code>
				<Badge variant={statusBadgeByValue[item.status] ?? "outline"} size="sm">
					{item.status}
				</Badge>
			</div>
			<p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
				{item.marketplaceId ?? "Unknown marketplace"}
			</p>
			<p className="mt-1 text-xs text-muted-foreground">
				Processed: {formatRelativeFromNow(item.finishedAt)} ({formatDateTime(item.finishedAt)})
			</p>
			<p className="mt-0.5 text-xs text-muted-foreground">
				Duration: {formatDuration(item.durationMs)}
			</p>
			{item.errorMessage ? (
				<p className="mt-1 line-clamp-2 text-xs text-destructive">{item.errorMessage}</p>
			) : null}
		</div>
	);
};

const statusBadgeByValue: Record<string, "success" | "error" | "outline"> = {
	success: "success",
	failed: "error",
};

const formatDuration = (durationMs: number) => {
	if (durationMs < 1000) {
		return `${durationMs}ms`;
	}
	if (durationMs < 60_000) {
		return `${(durationMs / 1000).toFixed(2)}s`;
	}

	const minutes = Math.floor(durationMs / 60_000);
	const seconds = Math.floor((durationMs % 60_000) / 1000);
	return `${minutes}m ${seconds}s`;
};

const formatDateTime = (isoDate: string) => {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) {
		return "Invalid date";
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(date);
};

const formatRelativeFromNow = (isoDate: string) => {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) {
		return "Invalid date";
	}

	const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
	const isFuture = diffSeconds < 0;
	const absoluteSeconds = Math.abs(diffSeconds);
	const unitLabel = isFuture ? "in" : "ago";

	if (absoluteSeconds < 60) {
		return isFuture ? `in ${absoluteSeconds}s` : `${absoluteSeconds}s ago`;
	}

	const absoluteMinutes = Math.floor(absoluteSeconds / 60);
	if (absoluteMinutes < 60) {
		return isFuture ? `in ${absoluteMinutes}m` : `${absoluteMinutes}m ago`;
	}

	const absoluteHours = Math.floor(absoluteMinutes / 60);
	if (absoluteHours < 24) {
		return isFuture ? `in ${absoluteHours}h` : `${absoluteHours}h ago`;
	}

	const absoluteDays = Math.floor(absoluteHours / 24);
	return `${isFuture ? `${unitLabel} ${absoluteDays}d` : `${absoluteDays}d ${unitLabel}`}`;
};
