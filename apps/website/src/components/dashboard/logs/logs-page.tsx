import { Loader2, Pause, Play, RefreshCw, Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { FilterGroup, LogDetails, TableCell, TableHead } from "./logs-ui-parts";
import {
	type EventLogLevel,
	type EventLogPrimitiveType,
	type EventLogStatus,
	formatLogTime,
	getTargetLabel,
	levelBadgeVariantByLevel,
	levelOptions,
	statusBadgeVariantByStatus,
	statusOptions,
	toggleFilter,
	typeOptions,
} from "./logs-utils";

export const LogsPage = () => {
	const [searchValue, setSearchValue] = useState("");
	const [activeLevels, setActiveLevels] = useState<EventLogLevel[]>([]);
	const [activeStatuses, setActiveStatuses] = useState<EventLogStatus[]>([]);
	const [activeTypes, setActiveTypes] = useState<EventLogPrimitiveType[]>([]);
	const [isLive, setIsLive] = useState(true);
	const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
	const deferredSearchValue = useDeferredValue(searchValue.trim());

	const queryInput = useMemo(
		() => ({
			limit: 100,
			levels: activeLevels.length > 0 ? activeLevels : undefined,
			statuses: activeStatuses.length > 0 ? activeStatuses : undefined,
			primitiveTypes: activeTypes.length > 0 ? activeTypes : undefined,
			search: deferredSearchValue.length > 0 ? deferredSearchValue : undefined,
		}),
		[activeLevels, activeStatuses, activeTypes, deferredSearchValue],
	);

	const query = api.api.app.eventLogs.useInfiniteQuery(queryInput, {
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		refetchInterval: isLive ? 5000 : false,
		refetchOnWindowFocus: false,
	});

	const logs = useMemo(
		() => query.data?.pages.flatMap((page) => page.items) ?? [],
		[query.data],
	);

	const selectedLog = useMemo(() => {
		const match = logs.find((log) => log.id === selectedLogId);
		return match ?? logs[0] ?? null;
	}, [logs, selectedLogId]);

	const hasFilters =
		activeLevels.length > 0 ||
		activeStatuses.length > 0 ||
		activeTypes.length > 0 ||
		deferredSearchValue.length > 0;

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
			<div className="shrink-0 border-b border-border">
				<div className="relative flex items-center">
					<Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={searchValue}
						onChange={(event) => setSearchValue(event.target.value)}
						placeholder="Filter by action, message, ASIN..."
						className="h-9 rounded-none border-0 bg-transparent px-9 text-xs shadow-none focus-within:ring-0"
					/>
					{searchValue.trim().length > 0 ? (
						<Button
							aria-label="Clear search"
							className="absolute right-3 top-1/2 size-7 -translate-y-1/2 rounded-sm p-0 text-muted-foreground hover:text-foreground"
							onClick={() => setSearchValue("")}
							size="sm"
							variant="ghost"
						>
							<X className="size-3.5" />
						</Button>
					) : null}
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-4 border-b border-border px-3 py-1.5">
				<FilterGroup
					label="Level"
					options={levelOptions}
					selectedValues={activeLevels}
					onToggle={(value) =>
						setActiveLevels(toggleFilter(activeLevels, value))
					}
				/>
				<FilterGroup
					label="Status"
					options={statusOptions}
					selectedValues={activeStatuses}
					onToggle={(value) =>
						setActiveStatuses(toggleFilter(activeStatuses, value))
					}
				/>
				<FilterGroup
					label="Type"
					options={typeOptions}
					selectedValues={activeTypes}
					onToggle={(value) => setActiveTypes(toggleFilter(activeTypes, value))}
				/>

				<div className="ml-auto flex items-center gap-2">
					{hasFilters ? (
						<Button
							className="h-auto rounded-sm px-0 py-0 text-[11px] text-muted-foreground hover:text-foreground"
							onClick={() => {
								setActiveLevels([]);
								setActiveStatuses([]);
								setActiveTypes([]);
								setSearchValue("");
							}}
							size="sm"
							variant="ghost"
						>
							Clear
						</Button>
					) : null}
					<span className="font-mono text-[11px] text-muted-foreground">
						{logs.length} rows
					</span>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="size-7 rounded-sm p-0"
						onClick={() => {
							void query.refetch();
						}}
						disabled={query.isFetching}
					>
						{query.isFetching ? (
							<Loader2 className="size-3 animate-spin" />
						) : (
							<RefreshCw className="size-3" />
						)}
					</Button>
					<Button
						type="button"
						size="sm"
						variant={isLive ? "secondary" : "ghost"}
						className="h-7 rounded-sm px-2 text-[11px]"
						onClick={() => setIsLive((value) => !value)}
					>
						{isLive ? (
							<Pause className="mr-1 size-3" />
						) : (
							<Play className="mr-1 size-3" />
						)}
						{isLive ? "Live" : "Paused"}
					</Button>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
				<div className="min-h-0 min-w-0 flex-1 overflow-auto">
					<table className="w-full border-collapse text-xs">
						<thead className="sticky top-0 z-10 bg-card">
							<tr className="border-b border-border">
								<TableHead>Time</TableHead>
								<TableHead>Level</TableHead>
								<TableHead>Action</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Target</TableHead>
								<TableHead>Message</TableHead>
								<TableHead>Status</TableHead>
							</tr>
						</thead>
						<tbody>
							{query.isLoading ? (
								<tr>
									<td
										colSpan={7}
										className="px-3 py-6 text-center text-muted-foreground"
									>
										Loading logs...
									</td>
								</tr>
							) : null}
							{query.error ? (
								<tr>
									<td
										colSpan={7}
										className="px-3 py-6 text-center text-destructive"
									>
										Failed to load logs.
									</td>
								</tr>
							) : null}
							{!query.isLoading && !query.error && logs.length === 0 ? (
								<tr>
									<td
										colSpan={7}
										className="px-3 py-6 text-center text-muted-foreground"
									>
										No logs found for the current filters.
									</td>
								</tr>
							) : null}
							{logs.map((log) => (
								<tr
									key={log.id}
									className={cn(
										"cursor-pointer border-b border-border hover:bg-muted/35",
										selectedLog?.id === log.id ? "bg-muted/45" : "",
									)}
									onClick={() => setSelectedLogId(log.id)}
								>
									<TableCell className="whitespace-nowrap font-mono text-muted-foreground">
										{formatLogTime(log.occurredAt)}
									</TableCell>
									<TableCell>
										<Badge
											size="sm"
											variant={levelBadgeVariantByLevel[log.level]}
										>
											{log.level.toUpperCase()}
										</Badge>
									</TableCell>
									<TableCell className="whitespace-nowrap font-mono text-info-foreground">
										{log.action}
									</TableCell>
									<TableCell>
										<Badge size="sm" variant="outline">
											{log.primitiveType}
										</Badge>
									</TableCell>
									<TableCell className="whitespace-nowrap font-mono text-muted-foreground">
										{getTargetLabel(log)}
									</TableCell>
									<TableCell className="max-w-[360px] truncate">
										{log.message}
									</TableCell>
									<TableCell>
										<Badge
											size="sm"
											variant={statusBadgeVariantByStatus[log.status]}
										>
											{log.status.toUpperCase()}
										</Badge>
									</TableCell>
								</tr>
							))}
						</tbody>
					</table>
					{query.hasNextPage ? (
						<div className="border-t border-border p-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-8 rounded-sm px-3 text-xs"
								onClick={() => void query.fetchNextPage()}
								disabled={query.isFetchingNextPage}
							>
								{query.isFetchingNextPage
									? "Loading older logs..."
									: "Load older logs"}
							</Button>
						</div>
					) : null}
				</div>

				<div className="border-t border-border bg-muted/25 lg:w-[360px] lg:border-l lg:border-t-0">
					<LogDetails log={selectedLog} />
				</div>
			</div>
		</div>
	);
};
