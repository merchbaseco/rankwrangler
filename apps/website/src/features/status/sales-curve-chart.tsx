import { type PointerEvent, useMemo, useState } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatBsrCompact, formatCount } from '@/features/bsr/bsr-format';
import { bsrTierDefinitions, classifyBsr, tierClassName } from '@/features/bsr/bsr-tier';
import { curveMonthlySales, formatSalesPace, type SalesCurve } from '@/features/bsr/sales-estimate';
import { useElementWidth } from '@/hooks/use-element-width';
import { cn } from '@/lib/utils';
import { type CurveEvidence, salesCurveGeometry } from './sales-curve-geometry';

/**
 * Sales a month by rank, both on log scales, over the tier bands: the fitted
 * curve in the accent with the range most shirts land in washed behind it,
 * the typical badged shirt per rank as a dot in its tier's swatch, and the
 * pace written at #100K, #300K and #1M. The pointer reads any rank's pace in
 * a cursor tooltip. It measures its width and draws at that pixel size.
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
                        aria-label={`Sales a month by rank: ${geometry.callouts
                            .map(callout => callout.label)
                            .join(', ')} at #100K, #300K and #1M`}
                        height={height}
                        onPointerLeave={() => setRank(null)}
                        onPointerMove={handlePointerMove}
                        role="img"
                        viewBox={`0 0 ${width} ${height}`}
                        width={width}
                    >
                        {geometry.bands.map(band => (
                            <g className={tierClassName(band.tier)} key={band.tier}>
                                <rect
                                    className="sales-curve__band"
                                    height={geometry.plot.bottom - geometry.plot.top}
                                    width={band.width}
                                    x={band.x}
                                    y={geometry.plot.top}
                                />
                                <text
                                    className="sales-curve__band-label"
                                    x={band.x + 8}
                                    y={geometry.plot.top + 16}
                                >
                                    {bsrTierDefinitions[band.tier].label}
                                </text>
                            </g>
                        ))}
                        <path className="sales-curve__grid" d={geometry.grid} />
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
                        <path className="sales-curve__range" d={geometry.range} />
                        <path className="sales-curve__line" d={geometry.line} />
                        {geometry.evidence.map(dot => (
                            <circle
                                className={cn('sales-curve__evidence', tierClassName(dot.tier))}
                                cx={dot.x}
                                cy={dot.y}
                                key={`${dot.x}`}
                                r={4}
                            />
                        ))}
                        {geometry.callouts.map(callout => (
                            <g key={callout.label}>
                                <circle
                                    className="sales-curve__callout"
                                    cx={callout.x}
                                    cy={callout.y}
                                    r={4.5}
                                />
                                <text
                                    className="sales-curve__callout-label"
                                    textAnchor={callout.anchor}
                                    x={callout.labelX}
                                    y={callout.y + 20}
                                >
                                    {callout.label}
                                </text>
                            </g>
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
