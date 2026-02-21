export const statusDotClassByStatus: Record<string, string> = {
	success: 'bg-success',
	failed: 'bg-destructive',
};

export const formatDuration = (durationMs: number) => {
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

export const formatDateTime = (isoDate: string) => {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) {
		return 'Invalid date';
	}

	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).format(date);
};

export const formatLogTime = (isoDate: string) => {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) {
		return '--:--:--';
	}

	return new Intl.DateTimeFormat('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).format(date);
};

export const formatJson = (value: unknown) => {
	if (value === null || value === undefined) {
		return 'null';
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

export const formatCompactJson = (value: unknown) => {
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

export const getLogLevelClass = (level: string) => {
	if (level === 'error') {
		return 'text-destructive';
	}
	if (level === 'warn') {
		return 'text-warning-foreground';
	}
	return 'text-success-foreground';
};
