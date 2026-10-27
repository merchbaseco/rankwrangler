import { useEffect, useRef } from "react";
import { api } from "@/lib/trpc";

// Keyword job runs arrive in bursts; refresh queue status and run history at most every two
// seconds, without cancelling a refresh already in flight. Other jobs' runs are ignored.
export const useJobActivity = (jobNames: readonly string[]) => {
	const utils = api.useUtils();
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
			timer.current = null;
		},
		[],
	);
	api.api.app.jobs.activity.useSubscription(undefined, {
		onData: (event) => {
			if (event.kind === "changed" && !jobNames.includes(event.data.jobName)) return;
			if (timer.current) return;
			timer.current = setTimeout(() => {
				timer.current = null;
				const options = { cancelRefetch: false };
				void utils.api.app.jobs.keywordStatus.invalidate(undefined, undefined, options);
				void utils.api.app.jobExecutions.invalidate(undefined, undefined, options);
			}, 2000);
		},
	});
};
