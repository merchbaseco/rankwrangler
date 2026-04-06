import { useEffect, useState } from "react";

const formatLiveRelativeTime = (date: Date, now: number) => {
	const diffSeconds = Math.floor((now - date.getTime()) / 1000);
	if (diffSeconds < 60) return `${diffSeconds}s ago`;
	const diffMinutes = Math.floor(diffSeconds / 60);
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	const diffDays = Math.floor(diffHours / 24);
	return `${diffDays}d ago`;
};

const getTickInterval = (diffMs: number) => {
	if (diffMs < 60_000) return 1_000;
	if (diffMs < 3_600_000) return 30_000;
	return 60_000;
};

export const useLiveRelativeTime = (
	date: string | Date | null | undefined,
) => {
	const [now, setNow] = useState(Date.now);

	const parsed =
		date == null
			? null
			: typeof date === "string"
				? new Date(date)
				: date;
	const isValid = parsed !== null && !Number.isNaN(parsed.getTime());

	useEffect(() => {
		if (!isValid || parsed === null) return;

		const tick = () => setNow(Date.now());
		const interval = getTickInterval(Date.now() - parsed.getTime());
		const id = setInterval(tick, interval);
		return () => clearInterval(id);
	}, [isValid, parsed]);

	if (!isValid || parsed === null) return "never";
	return formatLiveRelativeTime(parsed, now);
};
