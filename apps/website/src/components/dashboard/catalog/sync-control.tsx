import { CircleAlert, Pause, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSyncControl } from "./use-sync-control";
import { useSyncControlSet } from "./use-sync-control-set";
import { useSyncControlChanged } from "./use-sync-control-changed";

export const SyncControl = () => {
	useSyncControlChanged();
	const query = useSyncControl();
	const mutation = useSyncControlSet();
	if (!query.data)
		return (
			<Button
				type="button"
				className="mr-2"
				variant="ghost"
				size="sm"
				disabled={query.isLoading}
				onClick={() => void query.refetch()}
			>
				{query.error ? "Retry sync status" : "Checking sync…"}
			</Button>
		);
	const { paused, canManage } = query.data;
	const Icon = paused ? Play : Pause;
	return (
		<div className="mr-2 flex shrink-0 items-center gap-2">
			{paused ? <Badge variant="warning">Sync paused</Badge> : null}
			{canManage ? (
				<Button
					type="button"
					size="sm"
					variant="outline"
					title={
						paused ? "Resume keyword processing" : "Pause keyword processing"
					}
					disabled={mutation.isPending}
					onClick={() => mutation.mutate({ paused: !paused })}
				>
					<Icon className="size-3.5" aria-hidden="true" />
					{mutation.isPending
						? mutation.variables?.paused
							? "Pausing…"
							: "Resuming…"
						: paused
							? "Resume sync"
							: "Pause sync"}
				</Button>
			) : null}
			{mutation.error ? (
				<span
					title={mutation.error.message}
					className="flex items-center gap-1 text-xs text-destructive"
				>
					<CircleAlert className="size-3.5" aria-hidden="true" />
					Couldn’t change sync
				</span>
			) : null}
		</div>
	);
};
