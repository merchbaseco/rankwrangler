import { Meter } from '@heroui/react';
import { TrendChip } from '@heroui-pro/react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatBsr, formatCount, formatPrice } from '@/features/bsr/bsr-format';
import { tierClassName } from '@/features/bsr/bsr-tier';
import { HalftoneSparkline } from '@/features/bsr/halftone-sparkline';
import { trendOf } from '@/features/bsr/trend';
import { nicheValueLabel } from '@/features/niche/niche-facet';
import { useDensity } from '@/hooks/use-density';
import { cn } from '@/lib/utils';
import { ArtPreview } from './art-preview';
import { type ExploreRow, formatAge, formatSold } from './explore-rows';
import { hasCutoutArt, ProductThumb, productArtUrl } from './product-thumb';

/** Set on the rank cell so the row menu and the j/k cursor find a row's ASIN. */
export const exploreRowAttribute = 'data-explore-asin';

/** The row's place in the whole ordering, carrying the ASIN the row tools look for. */
export const RankCell = ({ row }: { row: ExploreRow }) => (
    <span className="grid-figure grid-figure--muted" {...{ [exploreRowAttribute]: row.asin }}>
        {row.position.toLocaleString('en-US')}
    </span>
);

/**
 * The design: its art (cutout on the well, or Amazon's white image on a light
 * tile) with the whole print one hover away, then the short name over the
 * brand (Grid J).
 */
export const DesignCell = ({ row }: { row: ExploreRow }) => {
    const name = row.shortName ?? row.title ?? row.asin;
    const src = productArtUrl(row);
    return (
        <span className="design-cell">
            <ArtPreview name={name} salesRank={row.salesRank} src={src}>
                <ProductThumb isCutout={hasCutoutArt(row)} size="grid" src={src} />
            </ArtPreview>
            <span className="design-cell__text">
                <span className="design-cell__name" data-selectable-text>
                    {name}
                </span>
                {row.brand ? (
                    <span className="design-cell__brand" data-selectable-text>
                        {row.brand}
                    </span>
                ) : null}
            </span>
        </span>
    );
};

export const NicheCell = ({ row }: { row: ExploreRow }) => {
    const facet = row.facets[0];
    return facet ? (
        <span className="block truncate">{nicheValueLabel(facet.name)}</span>
    ) : (
        <span className="text-muted">—</span>
    );
};

/** The rank as a plain tier-coloured figure (the user's call: no ring, pill or bar). */
export const BsrCell = ({ row }: { row: ExploreRow }) => (
    <span className={cn('bsr-figure', tierClassName(row.tier))} data-selectable-text>
        {formatBsr(row.salesRank)}
    </span>
);

/**
 * The 30-day halftone area at the density's size. A design listed under 30
 * days ago draws only its days, right-aligned, so the line's length says how
 * new it is (Grid J).
 */
export const SparkCell = ({ row }: { row: ExploreRow }) => {
    const { density } = useDensity();
    const size = density === 'compact' ? compactSpark : comfortableSpark;
    const share = row.ageDays === null ? 1 : Math.min(1, Math.max(minSparkShare, row.ageDays / 30));
    return (
        <span className="spark-cell">
            <HalftoneSparkline
                height={size.height}
                series={row.bsr30d}
                tier={row.tier}
                width={Math.round(size.width * share)}
            />
        </span>
    );
};

/**
 * The seven-day move as a stock TrendChip: its own arrow and up/down colour
 * from `trend`, the unsigned figure as its label (the arrow carries the sign);
 * a dash under seven days of history.
 */
export const MoveCell = ({ move }: { move: number | null }) =>
    move === null ? (
        <span className="text-muted">—</span>
    ) : (
        <TrendChip trend={trendOf(move)}>{`${Math.abs(move)}%`}</TrendChip>
    );

/** Sold per month over a stock Meter in a neutral ink, sized against the page's best seller. */
export const SoldCell = ({ row }: { row: ExploreRow }) =>
    row.sold ? (
        <CursorTooltip
            content={
                row.sold.isEstimate
                    ? `~${formatCount(row.sold.value)} a month, estimated from BSR`
                    : `${formatSold(row.sold)} bought in the past month (Amazon)`
            }
            triggerClassName="flex w-full"
        >
            <span className="sold-cell">
                <Meter
                    aria-label={`Sold per month against this page's best seller`}
                    value={Math.round(row.sold.share * 100)}
                >
                    <Meter.Track>
                        <Meter.Fill />
                    </Meter.Track>
                </Meter>
                <span className={cn('grid-figure', row.sold.isEstimate && 'grid-figure--muted')}>
                    {formatSold(row.sold)}
                </span>
            </span>
        </CursorTooltip>
    ) : (
        <span className="text-muted">—</span>
    );

export const DropsCell = ({ row }: { row: ExploreRow }) => (
    <span className="grid-figure">{formatCount(row.drops)}</span>
);

export const AgeCell = ({ row }: { row: ExploreRow }) => (
    <span className="grid-figure grid-figure--muted">{formatAge(row.ageDays)}</span>
);

export const PriceCell = ({ row }: { row: ExploreRow }) => (
    <span className="grid-figure">{formatPrice(row.price) ?? '—'}</span>
);

const comfortableSpark = { height: 32, width: 104 } as const;
/** The shortest line a day-old design draws, so it still reads as a mark. */
const minSparkShare = 0.15;
const compactSpark = { height: 16, width: 64 } as const;
