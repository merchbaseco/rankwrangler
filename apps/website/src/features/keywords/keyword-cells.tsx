import { Chip, Meter, ProgressCircle } from '@heroui/react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatBsr, formatCount } from '@/features/bsr/bsr-format';
import {
    bsrTierDefinitions,
    classifyBsr,
    rankStrength,
    tierClassName,
} from '@/features/bsr/bsr-tier';
import { SHELF_SIZE } from '@/features/bsr/top-ten-shelf';
import { WeekDots } from '@/features/bsr/week-dots';
import { useDensity } from '@/hooks/use-density';
import { cn } from '@/lib/utils';
import { heatDisplay, isRatedHeat, type KeywordRow, type RankedKeywordRow } from './keyword-model';

/** Set on the rank cell so the row menu and the j/k cursor find a row's keyword. */
export const keywordRowIdAttribute = 'data-keyword-row-id';

export const KeywordRankCell = ({ row }: { row: RankedKeywordRow }) => (
    <span className="grid-figure grid-figure--muted" {...{ [keywordRowIdAttribute]: row.id }}>
        {row.position.toLocaleString('en-US')}
    </span>
);

/** The term (copyable), the full phrase in a cursor tooltip when it truncates. */
export const KeywordCell = ({ row }: { row: KeywordRow }) => (
    <CursorTooltip content={row.term} triggerClassName="flex min-w-0">
        <span className="keyword-cell" data-selectable-text>
            {row.term}
        </span>
    </CursorTooltip>
);

/**
 * The standing score as a stock ProgressCircle ring, its figure, and the heat
 * as a soft Chip in the heat's status colour (Grid I SCORE). The tooltip adds
 * the Brand Analytics search frequency rank when Amazon ranks the term; an
 * unscored trial shows that rank in place of the score.
 */
export const ScoreCell = ({ row }: { row: KeywordRow }) => {
    const rank =
        row.searchFrequencyRank === null
            ? null
            : `#${row.searchFrequencyRank.toLocaleString('en-US')}`;
    const rankTip = rank ? ` · Brand Analytics search frequency rank ${rank}` : '';
    if (row.score === null) {
        return rank ? (
            <CursorTooltip content={`Not scored yet${rankTip}`} triggerClassName="inline-flex">
                <span className="text-muted">BA {rank}</span>
            </CursorTooltip>
        ) : (
            <span className="text-muted">Unrated</span>
        );
    }
    const score = Math.round(row.score);
    return (
        <CursorTooltip
            content={`Score ${score} of 100${isRatedHeat(row.heat) ? ` · ${heatDisplay[row.heat].label}` : ''}${rankTip}`}
            triggerClassName="inline-flex"
        >
            <span className="score-cell">
                <ProgressCircle
                    aria-label={`Score ${score} of 100`}
                    color="accent"
                    size="sm"
                    value={score}
                >
                    <ProgressCircle.Track>
                        <ProgressCircle.TrackCircle />
                        <ProgressCircle.FillCircle />
                    </ProgressCircle.Track>
                </ProgressCircle>
                <span className="grid-figure">{score}</span>
                {isRatedHeat(row.heat) ? (
                    // Phones keep the ring and figure; the chip's word gives the keyword its room.
                    <span className="max-md:hidden">
                        <Chip color={heatChipColor[row.heat]} size="sm" variant="soft">
                            {heatDisplay[row.heat].label}
                        </Chip>
                    </span>
                ) : null}
            </span>
        </CursorTooltip>
    );
};

/** Twelve weeks of score as halftone dot columns, at the density's size. */
export const WeeksCell = ({ row }: { row: KeywordRow }) => {
    const { density } = useDensity();
    return density === 'compact' ? (
        <WeekDots height={16} series={row.scoreTrend12w} width={64} />
    ) : (
        <WeekDots height={30} series={row.scoreTrend12w} width={112} />
    );
};

/**
 * The shelf's median BSR as Grid I's tier chip: a stock Meter in the tier's
 * fill, as long as the rank is strong (log scale, #600 full to #6M empty),
 * with a tier dot and the figure in the tier ink over it.
 */
export const MedianBsrCell = ({ medianBsr }: { medianBsr: number | null }) => {
    if (medianBsr === null) {
        return <span className="text-muted">—</span>;
    }
    const tier = classifyBsr(medianBsr);
    return (
        <CursorTooltip
            content={`${formatBsr(medianBsr)} median BSR of the top 10 · ${bsrTierDefinitions[tier].label}`}
            triggerClassName="flex w-full"
        >
            <span className={cn('median-cell', tierClassName(tier))}>
                <Meter
                    aria-label={`Median shelf BSR ${formatBsr(medianBsr)}`}
                    value={Math.round((rankStrength(medianBsr) ?? 0) * 100)}
                >
                    <Meter.Track>
                        <Meter.Fill />
                    </Meter.Track>
                </Meter>
                <span aria-hidden className="median-cell__dot" />
                <span className="median-cell__figure">{formatBsr(medianBsr)}</span>
            </span>
        </CursorTooltip>
    );
};

/** New designs on the shelf, out of its ten slots. */
export const FreshCell = ({ value }: { value: number }) => (
    <span className="grid-figure">
        {value}
        <span className="text-muted">/{SHELF_SIZE}</span>
    </span>
);

export const CountCell = ({ value }: { value: number }) => (
    <span className="grid-figure">{formatCount(value)}</span>
);

const heatChipColor = {
    cold: 'default',
    hot: 'danger',
    warm: 'warning',
} as const;
