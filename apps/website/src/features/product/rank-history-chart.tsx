import { ChartTooltip } from '@heroui-pro/react';
import { AreaChart } from '@heroui-pro/react/area-chart';
import { useMemo } from 'react';
import { ReferenceArea } from 'recharts';
import { formatBsr } from '@/features/bsr/bsr-format';
import { bsrTierDefinitions, classifyBsr, tierClassName } from '@/features/bsr/bsr-tier';
import type { RankPoint } from '@/features/bsr/sparkline-geometry';
import {
    bandPixelHeight,
    formatRankTick,
    formatTimeTick,
    MIN_BAND_LABEL_PX,
    rankDomain,
    rankTicks,
    tierBands,
    timeTicks,
} from './rank-history-axis';

/** Bands sit under the line but above the (unused) grid layer. */
const BAND_Z_INDEX = -10;
/** The x-axis row under the plot, and the plot's top margin, outside the bands. */
const X_AXIS_PX = 30;
const TOP_MARGIN_PX = 6;

/**
 * BSR over time on a reversed log axis (a better rank climbs), drawn over the
 * five tier bands so every stretch of the line reads its tier. A Pro
 * AreaChart; the bands are Recharts `ReferenceArea`s, which the chart accepts
 * as children. As in the explore-terminal mock the line is ink with no fill
 * over full-strength bands, the latest sample gets a dot in its tier, and the
 * stock chart tooltip follows the cursor. `compact` (Explore's detail pane)
 * drops both axes: the band labels and the date row under it carry the scale.
 */
export const RankHistoryChart = ({
    compact = false,
    height,
    series,
}: {
    compact?: boolean;
    /** Plot height in px. */
    height: number;
    series: readonly RankPoint[];
}) => {
    const data = useMemo(
        () => series.map(point => ({ bsr: point.salesRank, time: Date.parse(point.at) })),
        [series]
    );
    const domain = useMemo(() => rankDomain(series.map(point => point.salesRank)), [series]);
    const start = data[0]?.time ?? 0;
    const end = data.at(-1)?.time ?? 0;
    const span = end - start;
    const latest = series.at(-1)?.salesRank ?? null;
    const plotHeight = compact ? height : height - X_AXIS_PX - TOP_MARGIN_PX;

    return (
        <div className={`product-rank-chart ${tierClassName(classifyBsr(latest))}`}>
            <AreaChart
                data={data}
                height={height}
                margin={{
                    bottom: 0,
                    left: 0,
                    right: compact ? 0 : 4,
                    top: compact ? 0 : TOP_MARGIN_PX,
                }}
            >
                {tierBands(domain).map(band => (
                    <ReferenceArea
                        fill={`var(--tier-${band.tier}-bg)`}
                        fillOpacity={1}
                        ifOverflow="hidden"
                        key={band.tier}
                        // A sliver of a band gets no label: it would spill onto its neighbour.
                        label={
                            bandPixelHeight(band, domain, plotHeight) >= MIN_BAND_LABEL_PX
                                ? {
                                      className: 'product-rank-chart__band-label',
                                      fill: `var(--tier-${band.tier}-fg)`,
                                      position: 'insideTopRight',
                                      value: bsrTierDefinitions[band.tier].label,
                                  }
                                : undefined
                        }
                        y1={band.y1}
                        y2={band.y2}
                        zIndex={BAND_Z_INDEX}
                    />
                ))}
                <AreaChart.XAxis
                    dataKey="time"
                    domain={['dataMin', 'dataMax']}
                    hide={compact}
                    scale="time"
                    tickFormatter={(value: number) => formatTimeTick(value, span)}
                    tickMargin={6}
                    ticks={timeTicks(start, end)}
                    type="number"
                />
                <AreaChart.YAxis
                    allowDataOverflow
                    domain={domain}
                    hide={compact}
                    reversed
                    scale="log"
                    tickFormatter={formatRankTick}
                    ticks={rankTicks(domain)}
                    width={44}
                />
                <AreaChart.Area
                    baseValue="dataMax"
                    dataKey="bsr"
                    dot={(props: DotProps) => latestDot(props, data.length - 1)}
                    fill="none"
                    isAnimationActive={false}
                    name="BSR"
                    stroke="var(--foreground)"
                    strokeWidth={1.5}
                    type="monotone"
                />
                <AreaChart.Tooltip
                    content={({ active, payload }) => {
                        const point = payload?.[0]?.payload as
                            | { bsr: number; time: number }
                            | undefined;
                        if (!(active && point)) {
                            return null;
                        }
                        const tier = classifyBsr(point.bsr);
                        return (
                            <ChartTooltip>
                                <ChartTooltip.Header>
                                    {formatTooltipDate(point.time)}
                                </ChartTooltip.Header>
                                <ChartTooltip.Item>
                                    <ChartTooltip.Indicator color={`var(--tier-${tier}-fg)`} />
                                    <ChartTooltip.Label>
                                        BSR · {bsrTierDefinitions[tier].label}
                                    </ChartTooltip.Label>
                                    <ChartTooltip.Value>{formatBsr(point.bsr)}</ChartTooltip.Value>
                                </ChartTooltip.Item>
                            </ChartTooltip>
                        );
                    }}
                />
            </AreaChart>
        </div>
    );
};

interface DotProps {
    readonly cx?: number;
    readonly cy?: number;
    readonly index?: number;
}

const latestDot = ({ cx, cy, index }: DotProps, lastIndex: number) =>
    index === lastIndex && cx !== undefined && cy !== undefined ? (
        <circle className="product-rank-chart__now" cx={cx} cy={cy} key="now" r={3.5} />
    ) : (
        <g key={`dot-${index}`} />
    );

const formatTooltipDate = (time: number) =>
    new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
    }).format(new Date(time));
