import { ChevronDown, ChevronUp } from "lucide-react";
import {
	formatCompactJson,
	formatDateTime,
	formatDuration,
	formatJson,
	formatLogTime,
	getLogLevelClass,
	statusDotClassByStatus,
} from "@/components/dashboard/job-executions-panel/formatters";
import type { JobExecution } from "@/components/dashboard/job-executions-panel/types";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";

export const ExecutionRow = ({
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
			<Button
				className="h-auto w-full justify-between rounded-none px-3 py-2 text-left hover:bg-muted/40"
				onClick={onToggle}
				size="sm"
				variant="ghost"
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span
							className={cn("inline-block size-2 rounded-full", statusDotClass)}
						/>
						<code className="text-foreground truncate font-mono text-xs">
							{execution.jobName}
						</code>
					</div>
					<p className="text-muted-foreground mt-1 text-xs font-mono">
						{formatRelativeTime(execution.startedAt)} {"  "}(
						{formatDateTime(execution.startedAt)}) {"  "}•{"  "}
						{formatDuration(execution.durationMs)}
					</p>
				</div>
				{isExpanded ? (
					<ChevronUp className="text-muted-foreground mt-0.5 size-4 shrink-0" />
				) : (
					<ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0" />
				)}
			</Button>
			{isExpanded ? <ExpandedExecution execution={execution} /> : null}
		</div>
	);
};

const ExpandedExecution = ({ execution }: { execution: JobExecution }) => (
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
);

const JsonBlock = ({ label, value }: { label: string; value: unknown }) => (
	<div className="space-y-1.5">
		<p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.12em]">
			{label}
		</p>
		<pre className="text-foreground max-h-[170px] overflow-auto rounded-sm border border-border bg-background px-2 py-2 font-mono text-xs leading-5">
			{formatJson(value)}
		</pre>
	</div>
);
