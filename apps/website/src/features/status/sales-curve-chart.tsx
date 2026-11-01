import { type PointerEvent, useId, useMemo, useState } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatBsrCompact, formatCount } from '@/features/bsr/bsr-format';
import { bsrTierDefinitions, classifyBsr, tierClassName } from '@/features/bsr/bsr-tier';
import { curveMonthlySales, formatSalesPace, type SalesCurve } from '@/features/bsr/sales-estimate';
import { useElementWidth } from '@/hooks/use-element-width';
import { cn } from '@/lib/utils';
import { type CurveEvidence, salesCurveGeometry } from './sales-curve-geometry';

/**
 * Sales a month by rank, both on log scales, drawn like the Product page's
 * rank chart: the fitted curve as an ink line over a halftone fill whose dots
 * take the ink of the tier slice they sit in, dashed cuts at the tier edges
 * with each tier named above its slice and railed below, and the typical
 * badged shirt per rank as a dot in its tier's swatch. The pointer reads any
 * rank's pace in a cursor tooltip. It measures its width and draws at that
 * pixel size.
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
                                        height={geometry.plot.bottom - geometry.plot.top}
                                        width={band.width}
                                        x={band.x}
                                        y={geometry.plot.top}
                                    />
                                </clipPath>
                            ))}
                        </defs>
                        <path className="sales-curve__grid" d={geometry.grid} />
                        <path className="sales-curve__cut" d={geometry.cuts} />
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
                        {geometry.bands.map(band => (
                            <path
                                className="sales-curve__fill"
                                clipPath={`url(#${id}-band-${band.tier})`}
                                d={geometry.area}
                                fill={`url(#${id}-dots-${band.tier})`}
                                key={band.tier}
                            />
                        ))}
                        <path className="sales-curve__line" d={geometry.line} />
                        {geometry.evidence.map(dot => (
                            <circle
                                className={cn('sales-curve__evidence', tierClassName(dot.tier))}
                                cx={dot.x}
                                cy={dot.y}
                                key={`${dot.x}`}
                                r={4.5}
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
