import { ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Frame } from "@/components/ui/frame";
import { api, type RouterOutputs } from "@/lib/trpc";
import { cn, formatRelativeTime } from "@/lib/utils";

type JobExecution = RouterOutputs["api"]["app"]["jobExecutions"][number];

const statusDotClassByStatus: Record<string, string> = {
	success: "bg-success",
	failed: "bg-destructive",
};

type JobExecutionsPanelProps = {
	className?: string;
	rowsClassName?: string;
};

export function JobExecutionsPanel({
	className,
	rowsClassName,
}: JobExecutionsPanelProps) {
	const [expandedExecutionId, setExpandedExecutionId] = useState<string | null>(
		null,
	);
	const query = api.api.app.jobExecutions.useQuery(
		{ limit: 25 },
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
						<p className="text-foreground text-xs font-medium">Job Executions</p>
						<p className="text-muted-foreground mt-0.5 text-xs">
							Admin runtime history and logs
						</p>
					</div>
					<div className="flex items-center gap-2">
						{query.data ? (
							<Badge variant="secondary" className="h-4 rounded-sm px-1.5 text-xs">
								{query.data.length} recent
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
							aria-label="Refresh job executions"
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
					<p className="text-muted-foreground px-3 py-3 text-sm">
						Loading recent executions...
					</p>
				) : null}

				{errorCode === "UNAUTHORIZED" ? (
					<p className="text-warning-foreground px-3 py-3 text-sm">
						Session expired. Please sign out and back in.
					</p>
				) : null}

				{query.error && errorCode !== "UNAUTHORIZED" && errorCode !== "FORBIDDEN" ? (
					<p className="text-destructive px-3 py-3 text-sm">
						Failed to load job executions.
					</p>
				) : null}

				{!query.isLoading && !query.error && (query.data?.length ?? 0) === 0 ? (
					<p className="text-muted-foreground px-3 py-3 text-sm">
						No recent execution logs recorded.
					</p>
				) : null}

				{(query.data?.length ?? 0) > 0 ? (
					<div className={cn("max-h-[420px] overflow-y-auto", rowsClassName)}>
						{query.data?.map((execution) => {
							const isExpanded = expandedExecutionId === execution.id;

							return (
								<ExecutionRow
									key={execution.id}
									execution={execution}
									isExpanded={isExpanded}
									onToggle={() => {
										setExpandedExecutionId((current) =>
											current === execution.id ? null : execution.id,
										);
									}}
								/>
							);
						})}
					</div>
				) : null}
			</Frame>
		</div>
	);
}

const ExecutionRow = ({
	execution,
	isExpanded,
	onToggle,
}: {
	execution: JobExecution;
	isExpanded: boolean;
	onToggle: () => void;
}) => {
	const statusDotClass =
		statusDotClassByStatus[execution.status] ?? "bg-warning";

	return (
		<div className="border-border border-b last:border-b-0">
			<button
				type="button"
				onClick={onToggle}
				className="hover:bg-muted/40 flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors"
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className={cn("inline-block size-2 rounded-full", statusDotClass)} />
						<code className="text-foreground truncate font-mono text-xs">
							{execution.jobName}
						</code>
					</div>
					<p className="text-muted-foreground mt-1 text-xs font-mono">
						{formatRelativeTime(execution.startedAt)}
						{"  "}({formatDateTime(execution.startedAt)}) {"  "}•{"  "}
						{formatDuration(execution.durationMs)}
					</p>
				</div>
				{isExpanded ? (
					<ChevronUp className="text-muted-foreground mt-0.5 size-4 shrink-0" />
				) : (
					<ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0" />
				)}
			</button>

			{isExpanded ? (
				<div className="border-border space-y-3 border-t bg-muted/20 px-3 py-3">
					{execution.errorMessage ? (
						<p className="text-destructive rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs">
							{execution.errorMessage}
						</p>
					) : null}

					<div className="grid gap-3 lg:grid-cols-2">
						<JsonBlock label="Input" value={execution.input} />
						<JsonBlock label="Output" value={execution.output} />
					</div>

					<div className="space-y-1.5">
						<p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.12em]">
							Logs
						</p>
						{execution.logs.length === 0 ? (
							<p className="text-muted-foreground text-xs">No logs captured.</p>
						) : (
							<div className="rounded-sm border border-border bg-background px-2 py-2">
								{execution.logs.map((log) => (
									<p
										key={log.id}
										className="text-foreground font-mono text-xs leading-5"
									>
										<span className="text-muted-foreground">
											{formatLogTime(log.createdAt)}
										</span>
										{"  "}
										<span className={getLogLevelClass(log.level)}>
											{log.level.toUpperCase()}
										</span>
										{"  "}
										{log.message}
										{log.context ? ` ${formatCompactJson(log.context)}` : ""}
									</p>
								))}
							</div>
						)}
					</div>
				</div>
			) : null}
		</div>
	);
};

const JsonBlock = ({ label, value }: { label: string; value: unknown }) => {
	return (
		<div className="space-y-1.5">
			<p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.12em]">
				{label}
			</p>
			<pre className="text-foreground max-h-[170px] overflow-auto rounded-sm border border-border bg-background px-2 py-2 font-mono text-xs leading-5">
				{formatJson(value)}
			</pre>
		</div>
	);
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

const formatLogTime = (isoDate: string) => {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) {
		return "--:--:--";
	}

	return new Intl.DateTimeFormat("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(date);
};

const formatJson = (value: unknown) => {
	if (value === null || value === undefined) {
		return "null";
	}

	try {
		const json = JSON.stringify(value, null, 2);
		if (json.length <= 4000) {
			return json;
		}
		return `${json.slice(0, 4000)}\n...truncated`;
	} catch {
		return String(value);
	}
};

const formatCompactJson = (value: unknown) => {
	try {
		const json = JSON.stringify(value);
		if (json.length <= 300) {
			return json;
		}
		return `${json.slice(0, 300)}...`;
	} catch {
		return String(value);
	}
};

const getLogLevelClass = (level: string) => {
	if (level === "error") {
		return "text-destructive";
	}
	if (level === "warn") {
		return "text-warning-foreground";
	}
	return "text-success-foreground";
};
