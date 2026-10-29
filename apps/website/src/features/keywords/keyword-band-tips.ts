import { formatBsr, formatCount } from '@/features/bsr/bsr-format';
import { bsrTierDefinitions, classifyBsr } from '@/features/bsr/bsr-tier';
import { heatDisplay, isRatedHeat } from './keyword-model';

/**
 * What each Keywords KPI band reads under the pointer (Grid I bands; user
 * feedback: every data mark gets a hover tooltip).
 */

/** `75–80 · Hot · 9 keywords`. */
export const scoreBucketTip = (
    buckets: readonly {
        readonly bucketMax: number;
        readonly count: number;
        readonly heat: string;
    }[],
    index: number
) => {
    const bucket = buckets[index];
    if (!bucket) {
        return null;
    }
    const low = buckets[index - 1]?.bucketMax ?? 0;
    const heat = isRatedHeat(bucket.heat) ? ` · ${heatDisplay[bucket.heat].label}` : '';
    return `${low}–${bucket.bucketMax}${heat} · ${keywords(bucket.count)}`;
};

/** `6 of 13 keywords mined in the last 24h`. */
export const minedTip = (mined: number | null, total: number | null) =>
    mined === null
        ? null
        : `${formatCount(mined)} of ${keywords(total ?? 0)} mined in the last 24h`;

/** `#13,000 median shelf BSR · Hot`. */
export const shelfBsrTip = (median: number | null) =>
    median === null
        ? 'No shelf ranks yet'
        : `${formatBsr(median)} median shelf BSR · ${bsrTierDefinitions[classifyBsr(median)].label}`;

/** `3 need sync · 1 syncing, of 13 keywords · 40 trials awaiting check`. */
export const queueTip = (counts: {
    needsSync: number;
    syncing: number;
    total: number;
    trials: number;
}) => {
    const trials = counts.trials
        ? ` · ${formatCount(counts.trials)} ${counts.trials === 1 ? 'trial' : 'trials'} awaiting check`
        : '';
    return `${formatCount(counts.needsSync)} ${counts.needsSync === 1 ? 'needs' : 'need'} sync · ${formatCount(counts.syncing)} syncing, of ${keywords(counts.total)}${trials}`;
};

const keywords = (count: number) => `${formatCount(count)} ${count === 1 ? 'keyword' : 'keywords'}`;
