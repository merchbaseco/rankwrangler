/**
 * Figure formatting shared by every BSR surface. Figures render in Geist Mono
 * with tabular digits (the caller's `font-mono`); these only produce strings.
 */

const trailingZero = /\.0$/;

const integerFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** `#1,840`, or an em dash when there is no rank. */
export const formatBsr = (salesRank: number | null | undefined): string =>
    salesRank === null || salesRank === undefined ? '—' : `#${integerFormat.format(salesRank)}`;

/** `#450K`, `#1.2M`: a rank short enough for a dense tile or axis. */
export const formatBsrCompact = (salesRank: number | null | undefined): string =>
    salesRank === null || salesRank === undefined ? '—' : `#${formatCompact(salesRank)}`;

/** `12,480` with grouping, or an em dash. */
export const formatCount = (value: number | null | undefined): string =>
    value === null || value === undefined ? '—' : integerFormat.format(value);

/** `2.5K`, `1.2M`, `980`. */
export const formatCompact = (value: number): string => {
    if (value >= 1_000_000) {
        return `${trimFraction(value / 1_000_000)}M`;
    }
    if (value >= 1000) {
        return `${trimFraction(value / 1000)}K`;
    }
    return integerFormat.format(value);
};

/** `$19.99` from minor units and an ISO currency, or null when unpriced. */
export const formatPrice = (
    price: { amountMinor: number; currencyCode: string | null } | null | undefined
): string | null => {
    if (!price?.currencyCode) {
        return null;
    }
    return new Intl.NumberFormat('en-US', {
        currency: price.currencyCode,
        style: 'currency',
    }).format(price.amountMinor / 100);
};

/** Whole days since an ISO timestamp, or null when unknown or in the future. */
export const daysSince = (iso: string | null | undefined, now = Date.now()): number | null => {
    if (!iso) {
        return null;
    }
    const time = Date.parse(iso);
    if (Number.isNaN(time) || time > now) {
        return null;
    }
    return Math.floor((now - time) / 86_400_000);
};

/** `Oct 3` for a point in a short series. */
export const formatShortDate = (iso: string): string =>
    new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(iso)
    );

/**
 * `count` dates spread evenly in time across a series, first to last sample,
 * for the row of labels under a chart (mock: Jul 29 · Aug 20 · … · Oct 27).
 * Empty for fewer than two samples.
 */
export const evenDateLabels = (
    series: readonly { readonly at: string }[],
    count: number
): string[] => {
    const start = Date.parse(series[0]?.at ?? '');
    const end = Date.parse(series.at(-1)?.at ?? '');
    if (series.length < 2 || !(end > start) || count < 2) {
        return [];
    }
    return Array.from({ length: count }, (_, index) =>
        formatShortDate(new Date(start + ((end - start) * index) / (count - 1)).toISOString())
    );
};

const trimFraction = (value: number) =>
    value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(trailingZero, '');
