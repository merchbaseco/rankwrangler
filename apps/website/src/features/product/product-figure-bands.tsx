import { useMemo } from 'react';
import { formatBsr, formatShortDate } from '@/features/bsr/bsr-format';
import {
    type BsrTier,
    bsrTierDefinitions,
    classifyBsr,
    rankStrength,
    tierClassName,
} from '@/features/bsr/bsr-tier';
import { DotMatrixBand } from '@/features/bsr/dot-matrix-band';
import { bandLevels } from '@/features/bsr/dot-matrix-geometry';
import { HalftoneSparkline } from '@/features/bsr/halftone-sparkline';
import type { RankPoint } from '@/features/bsr/sparkline-geometry';
import { heatDisplay, isRatedHeat } from '@/features/keywords/keyword-model';
import { useElementWidth } from '@/hooks/use-element-width';
import type { ProductKeyword } from './use-product-keywords';

/** The last 30 days of rank as the row halftone, at the cell's full width. */
export const RankHalftoneBand = ({ days, tier }: { days: readonly RankPoint[]; tier: BsrTier }) => {
    const { ref, width } = useElementWidth<HTMLSpanElement>();
    return (
        <span className="grid-kpi__spark" ref={ref}>
            {width > 0 ? (
                <HalftoneSparkline height={SPARK_HEIGHT} series={days} tier={tier} width={width} />
            ) : null}
        </span>
    );
};

/** Ranks as dot columns lit to their strength and inked by their tier (daily or monthly). */
export const RankDotBand = ({
    label,
    points,
    when,
}: {
    label: string;
    points: readonly RankPoint[];
    /** How a point's date reads in the tooltip. */
    when: (iso: string) => string;
}) => {
    const values = useMemo(() => points.map(point => rankStrength(point.salesRank)), [points]);
    const keys = useMemo(() => points.map(point => classifyBsr(point.salesRank)), [points]);
    return (
        <DotMatrixBand
            keyClass={key => tierClassName(key as BsrTier)}
            keys={keys}
            label={label}
            tooltip={index => {
                const point = points[index];
                if (!point) {
                    return null;
                }
                const tier = classifyBsr(point.salesRank);
                return (
                    <span className={tierClassName(tier)}>
                        <span className="font-mono font-semibold text-tier-fg">
                            {formatBsr(point.salesRank)}
                        </span>
                        <span className="text-muted">
                            {' '}
                            · {bsrTierDefinitions[tier].label} · {when(point.at)}
                        </span>
                    </span>
                );
            }}
            values={values}
        />
    );
};

/** Rank drops per day: when the design sold, not only how often. */
export const DropsBand = ({ days }: { days: readonly { at: string; drops: number }[] }) => {
    const values = useMemo(() => bandLevels(days.map(day => day.drops)), [days]);
    return (
        <DotMatrixBand
            ink="steady"
            label="Rank drops by day, last 30 days"
            tooltip={index => {
                const day = days[index];
                return day ? (
                    <span>
                        <span className="font-mono">{day.drops}</span>
                        <span className="text-muted">
                            {' '}
                            {day.drops === 1 ? 'rank drop' : 'rank drops'} · {formatShortDate(day.at)}
                        </span>
                    </span>
                ) : null;
            }}
            values={values.map((value, index) => ((days[index]?.drops ?? 0) > 0 ? value : null))}
        />
    );
};

/**
 * One column per keyword in placement order, lit to its score: page-one
 * placements in the accent, the rest in their heat's ink.
 */
export const KeywordsBand = ({ keywords }: { keywords: readonly ProductKeyword[] }) => {
    // Padded to a floor of columns so a handful of keywords reads as a handful, not a wall.
    const values = useMemo(
        () => [
            ...keywords.map(keyword => (keyword.score === null ? null : keyword.score / 100)),
            ...Array.from({ length: Math.max(0, KEYWORD_COLUMNS - keywords.length) }, () => null),
        ],
        [keywords]
    );
    const keys = useMemo(
        () => keywords.map(keyword => (keyword.page === 1 ? pageOneKey : keyword.tier)),
        [keywords]
    );
    return (
        <DotMatrixBand
            keyClass={key => {
                if (key === pageOneKey) {
                    return 'band-ink-accent';
                }
                return isRatedHeat(key) ? tierClassName(heatDisplay[key].tier) : '';
            }}
            keys={keys}
            label="Keywords by score, page-one placements in the accent"
            tooltip={index => {
                const keyword = keywords[index];
                if (!keyword) {
                    return null;
                }
                return (
                    <span>
                        {keyword.keyword}
                        <span className="text-muted">
                            {keyword.score === null ? ' · unrated' : ` · ${Math.round(keyword.score)}`}
                            {keyword.position === null
                                ? ''
                                : ` · #${keyword.position} on page ${keyword.page}`}
                        </span>
                    </span>
                );
            }}
            values={values}
        />
    );
};

/** `Oct 2026` for a monthly best. */
export const formatMonth = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC', year: 'numeric' }).format(
        new Date(iso)
    );

const pageOneKey = 'page-one';

/** About one keyword per dot column in a 7-up KPI cell. */
const KEYWORD_COLUMNS = 28;

/** The 62px band less its rule and an 8px top margin. */
const SPARK_HEIGHT = 52;
