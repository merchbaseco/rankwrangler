import { type PointerEvent, useId, useMemo, useState } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatBsrCompact, formatCount } from '@/features/bsr/bsr-format';
import { bsrTierDefinitions, classifyBsr, tierClassName } from '@/features/bsr/bsr-tier';
import { curveMonthlySales, formatSalesPace, type SalesCurve } from '@/features/bsr/sales-estimate';
import { useElementWidth } from '@/hooks/use-element-width';
import { cn } from '@/lib/utils';
import { type CurveEvidence, salesCurveGeometry } from './sales-curve-geometry';

/**
 * Sales a month by rank, both on log scales: the fitted curve solid where
 * Amazon's badges back it and dotted where it projects past them, over a fill
 * that fades down from each tier slice's ink. Rings mark the ranks the KPI
 * cells report; each tier is named above its slice and railed below; the
 * typical badged shirt per rank is a dot in its tier's swatch. The pointer
 * reads any rank's pace in a cursor tooltip. It measures its width and draws
 * at that pixel size.
 */
export const SalesCurveChart = ({
    curve,
    evidence,
    height,
}: {
    curve: SalesCurve;
    evidence: readonly CurveEvidence[];
    height: number;
}) => {
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const geometry = useMemo(
        () => (width > 0 ? salesCurveGeometry(curve, evidence, { height, width }) : null),
        [curve, evidence, height, width]
    );
    const [rank, setRank] = useState<number | null>(null);
    // A fragment-safe id prefix: React's ids carry punctuation `url(#…)` would need escaping.
    const id = `curve${useId().replace(nonWord, '')}`;
    const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
        if (geometry) {
            const bounds = event.currentTarget.getBoundingClientRect();
            setRank(geometry.rankAt(event.clientX - bounds.left));
        }
    };
    const cursor = rank === null ? null : geometry?.pointAt(rank);
    // Narrow charts pack the rank bins closer, so the badge dots and rings shrink to stay apart.
    const isNarrow = width < NARROW_WIDTH;
    return (
        <div className="sales-curve" ref={ref}>
            {geometry ? (
                <CursorTooltip
                    content={rank === null ? null : <RankTip curve={curve} rank={rank} />}
                    triggerClassName="block"
                >
                    <svg
                        aria-label="Sales a month by Best Sellers Rank, with Amazon's badges"
                        height={height}
                        onPointerLeave={() => setRank(null)}
                        onPointerMove={handlePointerMove}
                        role="img"
                        viewBox={`0 0 ${width} ${height}`}
                        width={width}
                    >
                        <defs>
                            {geometry.bands.map(band => (
                                <linearGradient
                                    className={tierClassName(band.tier)}
                                    gradientUnits="userSpaceOnUse"
                                    id={`${id}-fade-${band.tier}`}
                                    key={band.tier}
                                    x1={0}
                                    x2={0}
                                    y1={geometry.plot.top}
                                    y2={geometry.plot.bottom}
                                >
                                    <stop className="sales-curve__fade-top" offset="0%" />
                                    <stop className="sales-curve__fade-bottom" offset="100%" />
                                </linearGradient>
                            ))}
                            {geometry.bands.map(band => (
                                <clipPath id={`${id}-band-${band.tier}`} key={band.tier}>
                                    <rect
                                        height={geometry.plot.bottom - geometry.plot.top}
                                        width={band.width}
                                        x={band.x}
                                        y={geometry.plot.top}
                                    />
                                </clipPath>
                            ))}
                        </defs>
                        <path className="sales-curve__grid" d={geometry.grid} />
                        {geometry.bands.map(band => (
                            <path
                                clipPath={`url(#${id}-band-${band.tier})`}
                                d={geometry.area}
                                fill={`url(#${id}-fade-${band.tier})`}
                                key={band.tier}
                            />
                        ))}
                        {geometry.bands.map(band => (
                            <g className={tierClassName(band.tier)} key={band.tier}>
                                <text
                                    className="sales-curve__band-label"
                                    x={band.x + 6}
                                    y={geometry.plot.top - 8}
                                >
                                    {bsrTierDefinitions[band.tier].label}
                                </text>
                                <rect
                                    className="sales-curve__rail"
                                    height={geometry.rail.height}
                                    width={Math.max(0, band.width - 2)}
                                    x={band.x + 1}
                                    y={geometry.rail.y}
                                />
                            </g>
                        ))}
                        {geometry.yTicks.map(tick => (
                            <text
                                className="sales-curve__tick"
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
                                className="sales-curve__tick"
                                key={tick.label}
                                textAnchor="middle"
                                x={tick.x}
                                y={height - 6}
                            >
                                {tick.label}
                            </text>
                        ))}
                        <path className="sales-curve__line" d={geometry.observedLine} />
                        <path
                            className="sales-curve__line sales-curve__line--projected"
                            d={geometry.projectedLine}
                        />
                        {geometry.evidence.map(dot => (
                            <circle
                                className={cn('sales-curve__evidence', tierClassName(dot.tier))}
                                cx={dot.x}
                                cy={dot.y}
                                key={`${dot.x}`}
                                r={isNarrow ? 4 : 6}
                            />
                        ))}
                        {geometry.markers.map(marker => (
                            <circle
                                className={cn('sales-curve__marker', tierClassName(marker.tier))}
                                cx={marker.x}
                                cy={marker.y}
                                key={marker.x}
                                r={isNarrow ? 5.5 : 7.5}
                            />
                        ))}
                        {cursor ? (
                            <>
                                <line
                                    className="sales-curve__cursor"
                                    x1={cursor.x}
                                    x2={cursor.x}
                                    y1={geometry.plot.top}
                                    y2={geometry.plot.bottom}
                                />
                                <circle
                                    className="sales-curve__hover"
                                    cx={cursor.x}
                                    cy={cursor.y}
                                    r={4}
                                />
                            </>
                        ) : null}
                    </svg>
                </CursorTooltip>
            ) : null}
        </div>
    );
};

const RankTip = ({ curve, rank }: { curve: SalesCurve; rank: number }) => {
    const tier = classifyBsr(rank);
    const monthly = curveMonthlySales(curve, rank);
    return (
        <span className={cn('flex flex-col', tierClassName(tier))}>
            <span className="font-mono font-semibold text-tier-fg">
                {formatBsrCompact(rank)} · {bsrTierDefinitions[tier].label}
            </span>
            <span className="text-muted">
                {formatSalesPace(monthly)} · ≈{formatCount(Math.round(monthly))} a month
            </span>
        </span>
    );
};

const nonWord = /\W/g;
const NARROW_WIDTH = 640;
