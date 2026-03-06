import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatNumber(value: number) {
	return new Intl.NumberFormat("en-US").format(value);
}

export function formatRelativeTime(date?: string | Date | null) {
	if (!date) return "Never";
	const time = typeof date === "string" ? new Date(date) : date;
	if (Number.isNaN(time.getTime())) return "Never";

	const diffSeconds = Math.floor((Date.now() - time.getTime()) / 1000);
	if (diffSeconds < 60) return `${diffSeconds}s ago`;
	const diffMinutes = Math.floor(diffSeconds / 60);
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	const diffDays = Math.floor(diffHours / 24);
	return `${diffDays}d ago`;
}

export function formatCalendarDate(
	date?: string | Date | null,
	fallback = "--",
) {
	if (!date) return fallback;
	const time = typeof date === "string" ? new Date(date) : date;
	if (Number.isNaN(time.getTime())) return fallback;

	return new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	}).format(time);
}
