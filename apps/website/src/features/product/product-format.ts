import { formatPrice } from '@/features/bsr/bsr-format';

/** `5m`, `2h`, `3d`, `6w` since an ISO timestamp; `now` under a minute. */
export const formatAgo = (iso: string, now = Date.now()): string => {
    const elapsed = Math.max(0, now - Date.parse(iso));
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) {
        return 'now';
    }
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    return days < 14 ? `${days}d` : `${Math.floor(days / 7)}w`;
};

/**
 * The current rank against its 30-day average, as a signed percent where
 * positive means selling better (a lower rank). Null without both figures.
 */
export const rankChangeVsAverage = (
    current: number | null | undefined,
    average: number | null | undefined
): number | null => {
    if (!(current && average) || current <= 0 || average <= 0) {
        return null;
    }
    return Math.round(((average - current) / average) * 100);
};

/**
 * How the new price moved across a window of samples (minor units, oldest
 * first): `flat 90d`, `+$2.00 · 90d`, or null with fewer than two samples.
 */
export const priceTrendLabel = (
    samples: readonly number[],
    currencyCode: string | null,
    windowLabel: string
): string | null => {
    const first = samples[0];
    const last = samples.at(-1);
    if (samples.length < 2 || first === undefined || last === undefined || !currencyCode) {
        return null;
    }
    const delta = last - first;
    if (delta === 0) {
        return `flat ${windowLabel}`;
    }
    const amount = formatPrice({ amountMinor: Math.abs(delta), currencyCode });
    return `${delta > 0 ? '+' : '−'}${amount} · ${windowLabel}`;
};
