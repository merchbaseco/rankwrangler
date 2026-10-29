export const formatCount = (value: number) => countFormatter.format(value);

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

export const formatMetricDateTime = (isoDate: string) => {
    const date = new Date(isoDate);
    return Number.isNaN(date.getTime()) ? 'Invalid date' : dateTimeFormatter.format(date);
};

/** Requests per second, with more decimals the slower the limit. */
export const formatRps = (value: number) => {
    if (!Number.isFinite(value)) {
        return '—';
    }
    if (value < 0.1) {
        return value.toFixed(4);
    }
    if (value < 1) {
        return value.toFixed(3);
    }
    return value < 10 ? value.toFixed(2) : value.toFixed(1);
};

/** A spend as KPI.Value should show it: a real but sub-cent spend reads as one cent, never zero. */
export const visibleUsd = (value: number) =>
    value > 0 && value < minVisibleUsd ? minVisibleUsd : value;

const minVisibleUsd = 0.01;

const countFormatter = new Intl.NumberFormat('en-US');

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
});
