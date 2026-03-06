import type { RouterOutputs } from "@/lib/trpc";

export type EventLogRow =
	RouterOutputs["api"]["app"]["eventLogs"]["items"][number];
export type EventLogLevel = EventLogRow["level"];
export type EventLogStatus = EventLogRow["status"];
export type EventLogPrimitiveType = EventLogRow["primitiveType"];

export const levelOptions: EventLogLevel[] = ["info", "warn", "error", "debug"];
export const statusOptions: EventLogStatus[] = [
	"success",
	"failed",
	"pending",
	"retrying",
	"partial",
];
export const typeOptions: EventLogPrimitiveType[] = [
	"product",
	"history",
	"job",
	"system",
];

export const levelBadgeVariantByLevel: Record<
	EventLogLevel,
	"info" | "warning" | "error" | "outline"
> = {
	info: "info",
	warn: "warning",
	error: "error",
	debug: "outline",
};

export const statusBadgeVariantByStatus: Record<
	EventLogStatus,
	"success" | "error" | "warning" | "outline"
> = {
	success: "success",
	failed: "error",
	pending: "outline",
	retrying: "warning",
	partial: "warning",
};

export const toggleFilter = <T extends string>(
	current: readonly T[],
	value: T,
) => {
	if (current.includes(value)) {
		return current.filter((item) => item !== value);
	}

	return [...current, value];
};

export const getTargetLabel = (log: EventLogRow) => {
	if (log.asin && log.marketplaceId) {
		return `${log.asin} (${log.marketplaceId})`;
	}

	if (log.asin) {
		return log.asin;
	}

	if (log.jobName) {
		return log.jobName;
	}

	return "--";
};

export const formatLogTime = (isoDate: string) => {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) {
		return "--:--:--";
	}

	return new Intl.DateTimeFormat("en-US", {
		day: "2-digit",
		hour: "2-digit",
		hour12: false,
		minute: "2-digit",
		month: "short",
		second: "2-digit",
	}).format(date);
};

export const formatDateTime = (isoDate: string) => {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) {
		return "Invalid date";
	}

	return new Intl.DateTimeFormat("en-US", {
		day: "2-digit",
		hour: "2-digit",
		hour12: false,
		minute: "2-digit",
		month: "short",
		second: "2-digit",
		year: "numeric",
	}).format(date);
};

export const formatJson = (value: unknown) => {
	try {
		const serialized = JSON.stringify(value, null, 2);
		if (!serialized) {
			return "null";
		}

		if (serialized.length > 8000) {
			return `${serialized.slice(0, 8000)}\n...truncated`;
		}

		return serialized;
	} catch {
		return String(value);
	}
};
