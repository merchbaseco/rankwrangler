const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_ITEMS = 30;
const MAX_OBJECT_KEYS = 60;
const MAX_SANITIZE_DEPTH = 5;

export const truncateString = (
	value: string,
	maxLength = MAX_STRING_LENGTH
): string => {
	if (value.length <= maxLength) {
		return value;
	}

	const remainingLength = value.length - maxLength;
	return `${value.slice(0, maxLength)}... [truncated ${remainingLength} chars]`;
};

export const sanitizeUnknown = (value: unknown, depth = 0): unknown => {
	if (value == null) {
		return value;
	}

	if (typeof value === "string") {
		return truncateString(value);
	}

	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return value;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: truncateString(value.message),
			stack: value.stack ? truncateString(value.stack) : undefined,
		};
	}

	if (depth >= MAX_SANITIZE_DEPTH) {
		return "[truncated:depth-limit]";
	}

	if (Array.isArray(value)) {
		const items = value
			.slice(0, MAX_ARRAY_ITEMS)
			.map((item) => sanitizeUnknown(item, depth + 1));
		if (value.length > MAX_ARRAY_ITEMS) {
			items.push(`[truncated ${value.length - MAX_ARRAY_ITEMS} items]`);
		}
		return items;
	}

	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		const sanitized: Record<string, unknown> = {};

		for (const [key, nestedValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
			sanitized[key] = sanitizeUnknown(nestedValue, depth + 1);
		}

		if (entries.length > MAX_OBJECT_KEYS) {
			sanitized.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
		}

		return sanitized;
	}

	return String(value);
};
