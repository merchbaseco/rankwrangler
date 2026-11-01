import { formatCompact } from '@/features/bsr/bsr-format';
import type { SalesCurveReport } from './use-sales-curve-fit';

/** How far a rank range's badge share may sit from the curve's before it reads as drift. */
const ON_TRACK_POINTS = 8;
const WATCH_POINTS = 15;

export type AccuracyStatus = 'onTrack' | 'watch' | 'off';

export const accuracyStatusLabels: Readonly<Record<AccuracyStatus, string>> = {
    onTrack: 'On track',
    watch: 'Watch',
    off: 'Off',
};

/**
 * One rank range of the accuracy check: the share of its shirts showing a
 * badge, the share the curve expects, and the gap in percentage points.
 */
export const accuracyRows = (ranges: SalesCurveReport['ranges']) =>
    ranges.map(range => {
        const actual = range.badged / range.products;
        const gap = Math.round((actual - range.expectedShare) * 100);
        return {
            actual,
            badged: range.badged,
            expected: range.expectedShare,
            gap,
            id: String(range.min),
            label: `#${formatCompact(range.min)}–${formatCompact(range.max)}`,
            products: range.products,
            status: accuracyStatus(gap),
        };
    });

export type AccuracyRow = ReturnType<typeof accuracyRows>[number];

/** `7 of 10 rank ranges on track`, or null before there are any. */
export const accuracySummary = (rows: readonly AccuracyRow[]) =>
    rows.length === 0
        ? null
        : `${rows.filter(row => row.status === 'onTrack').length} of ${rows.length} rank ranges on track`;

/** `+7 pts`, `−9 pts`, or `none`. */
export const formatGap = (gap: number) =>
    gap === 0 ? 'none' : `${gap > 0 ? '+' : '−'}${Math.abs(gap)} pts`;

const accuracyStatus = (gap: number): AccuracyStatus => {
    const size = Math.abs(gap);
    return size <= ON_TRACK_POINTS ? 'onTrack' : size <= WATCH_POINTS ? 'watch' : 'off';
};
