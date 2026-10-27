import { useEffect, useRef } from "react";
import { api } from "@/lib/trpc";

// Background jobs write logs in bursts. Coalesce them into at most one refresh a second, never
// cancel a refresh already running, and mark other filters' cached pages stale for when shown.
export const useEventLogCreated = (enabled: boolean) => {
	const utils = api.useUtils();
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
			timer.current = null;
		},
		[],
	);
	api.api.app.activity.created.useSubscription(undefined, {
		enabled,
		onData: () => {
			if (timer.current) return;
			timer.current = setTimeout(() => {
				timer.current = null;
				void utils.api.app.eventLogs.invalidate(undefined, undefined, {
					cancelRefetch: false,
				});
			}, 1000);
		},
	});
};
