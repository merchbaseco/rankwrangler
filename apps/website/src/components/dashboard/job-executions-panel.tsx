import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ExecutionRow } from "@/components/dashboard/job-executions-panel/execution-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Frame } from "@/components/ui/frame";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";

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
			refetchInterval: 15_000,
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
						<p className="text-foreground text-xs font-medium">
							Job Executions
						</p>
						<p className="text-muted-foreground mt-0.5 text-xs">
							Admin runtime history and logs
						</p>
					</div>
					<div className="flex items-center gap-2">
						{query.data ? (
							<Badge
								variant="secondary"
								className="h-4 rounded-sm px-1.5 text-xs"
							>
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
				{query.error &&
				errorCode !== "UNAUTHORIZED" &&
				errorCode !== "FORBIDDEN" ? (
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
