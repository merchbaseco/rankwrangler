import { type PointerEvent, useId, useMemo, useState } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatBsr } from '@/features/bsr/bsr-format';
import { bsrTierDefinitions, classifyBsr, tierClassName } from '@/features/bsr/bsr-tier';
import { nearestSampleIndex, type RankPoint } from '@/features/bsr/sparkline-geometry';
import { useElementWidth } from '@/hooks/use-element-width';
import { cn } from '@/lib/utils';
import { rankChartGeometry } from './rank-history-geometry';

/**
 * BSR over time on a reversed log axis (a better rank climbs), in the Grid
 * direction's halftone: the exact line over a dotted fill whose dots take the
 * ink of the tier band they sit in, so a spike reads how high it climbed. A
 * thin rail and name at the right edge mark each band, dashed rules its
 * thresholds. The best sample is ringed, the latest dotted in its tier; the
 * pointer reads the nearest sample in a cursor tooltip. It measures its width
 * and draws at that pixel size so the dots stay round.
 */
export const RankHistoryChart = ({
    height,
    series,
}: {
    /** Drawing height in px. */
    height: number;
    series: readonly RankPoint[];
}) => {
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const geometry = useMemo(
        () => (width > 0 ? rankChartGeometry(series, { height, width }) : null),
        [series, height, width]
    );
    const [hovered, setHovered] = useState<number | null>(null);
    // A fragment-safe id prefix: React's ids carry punctuation `url(#…)` would need escaping.
    const id = `rank${useId().replace(nonWord, '')}`;
    const ranked = useMemo(() => series.filter(point => point.salesRank > 0), [series]);
    const latest = ranked.at(-1);
    const shown = ranked[hovered ?? ranked.length - 1];

    const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
        if (!geometry) {
            return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        setHovered(
            nearestSampleIndex(
                geometry.points.map(point => point.x),
                event.clientX - bounds.left
            )
        );
    };

    const cursor = hovered === null ? null : geometry?.points[hovered];
    const best = geometry?.points[geometry.best];
    const end = geometry?.points.at(-1);
    return (
        <div className="rank-chart" ref={ref}>
            {geometry ? (
                <CursorTooltip content={shown ? <SampleTip point={shown} /> : null} triggerClassName="block">
                    <svg
                        aria-label={
                            latest ? `BSR history, latest ${formatBsr(latest.salesRank)}` : 'BSR history'
                        }
                        height={height}
                        onPointerLeave={() => setHovered(null)}
                        onPointerMove={handlePointerMove}
                        role="img"
                        viewBox={`0 0 ${width} ${height}`}
                        width={width}
                    >
                        <defs>
                            {geometry.bands.map(band => (
                                <pattern
                                    className={tierClassName(band.tier)}
                                    height={3}
                                    id={`${id}-dots-${band.tier}`}
                                    key={band.tier}
                                    patternUnits="userSpaceOnUse"
                                    width={3}
                                >
                                    <circle className="halftone-spark__dot" cx={1.5} cy={1.5} />
                                </pattern>
                            ))}
                            {geometry.bands.map(band => (
                                <clipPath id={`${id}-band-${band.tier}`} key={band.tier}>
                                    <rect
                                        height={band.height}
                                        width={geometry.plot.right - geometry.plot.left}
                                        x={geometry.plot.left}
                                        y={band.y}
                                    />
                                </clipPath>
                            ))}
                        </defs>
                        <path className="rank-chart__grid" d={geometry.grid} />
                        {geometry.bands.map(band => (
                            <path
                                className="rank-chart__fill"
                                clipPath={`url(#${id}-band-${band.tier})`}
                                d={geometry.area}
                                fill={`url(#${id}-dots-${band.tier})`}
                                key={band.tier}
                            />
                        ))}
                        <path className="rank-chart__cut" d={geometry.cuts} />
                        {geometry.bands.map(band => (
                            <g className={tierClassName(band.tier)} key={band.tier}>
                                <rect
                                    className="rank-chart__rail"
                                    height={Math.max(0, band.height - 2)}
                                    width={3}
                                    x={geometry.plot.right + 8}
                                    y={band.y + 1}
                                />
                                {band.label ? (
                                    <text
                                        className="rank-chart__band-label"
                                        dominantBaseline="middle"
                                        x={geometry.plot.right + 17}
                                        y={band.y + band.height / 2}
                                    >
                                        {bsrTierDefinitions[band.tier].label}
                                    </text>
                                ) : null}
                            </g>
                        ))}
                        {geometry.yTicks.map(tick => (
                            <text
                                className="rank-chart__tick"
                                dominantBaseline="middle"
                                key={tick.label}
                                textAnchor="end"
                                x={geometry.plot.left - 8}
                                y={tick.y}
                            >
                                {tick.label}
                            </text>
                        ))}
                        {geometry.xTicks.map(tick => (
                            <text
                                className="rank-chart__tick"
                                key={tick.x}
                                textAnchor="middle"
                                x={tick.x}
                                y={height - 8}
                            >
                                {tick.label}
                            </text>
                        ))}
                        <path className="rank-chart__line" d={geometry.line} />
                        {cursor ? (
                            <line
                                className="rank-chart__cursor"
                                x1={cursor.x}
                                x2={cursor.x}
                                y1={geometry.plot.top}
                                y2={geometry.plot.bottom}
                            />
                        ) : null}
                        {best ? (
                            <circle className="rank-chart__best" cx={best.x} cy={best.y} r={3.5} />
                        ) : null}
                        {end ? (
                            <circle
                                className={cn(
                                    'rank-chart__now',
                                    tierClassName(classifyBsr(latest?.salesRank))
                                )}
                                cx={end.x}
                                cy={end.y}
                                r={4}
                            />
                        ) : null}
                        {cursor ? (
                            <circle className="rank-chart__hover" cx={cursor.x} cy={cursor.y} r={3} />
                        ) : null}
                    </svg>
                </CursorTooltip>
            ) : null}
        </div>
    );
};

const SampleTip = ({ point }: { point: RankPoint }) => {
    const tier = classifyBsr(point.salesRank);
    return (
        <span className={cn('flex flex-col', tierClassName(tier))}>
            <span className="font-mono font-semibold text-tier-fg">
                {formatBsr(point.salesRank)}
            </span>
            <span className="text-muted">
                {bsrTierDefinitions[tier].label} · {formatSampleDate(point.at)}
            </span>
        </span>
    );
};

const formatSampleDate = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
    }).format(new Date(iso));

const nonWord = /\W/g;
