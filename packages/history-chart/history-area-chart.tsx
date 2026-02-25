import {
    Area,
    AreaChart,
    ReferenceDot,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { formatDateTooltip, type HistoryChartState } from './history-chart-utils';

type HistoryAreaChartProps = {
    chartState: HistoryChartState;
    color: string;
    gradientId: string;
    valueFormatter: (value: number) => string;
    axisValueFormatter: (value: number) => string;
    heightClassName: string;
    chartClassName?: string;
    yAxisWidth?: number;
    xAxisMinTickGap?: number;
    xAxisTickMargin?: number;
    yAxisTickMargin?: number;
    axisColor?: string;
    axisFontSize?: number;
    axisFontFamily?: string;
    cardStrokeColor?: string;
    tooltipContainerClassName?: string;
    tooltipValueClassName?: string;
    tooltipDateClassName?: string;
    margin?: {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
    };
    gradientStartOpacity?: number;
    gradientEndOpacity?: number;
};

type TooltipDatum = {
    timestamp: number;
    value: number;
};

const DEFAULT_MARGIN = {
    top: 4,
    right: 36,
    bottom: 4,
    left: 0,
};

const DEFAULT_CHART_CLASS = 'h-full cursor-crosshair';

const DEFAULT_TOOLTIP_CONTAINER_CLASS = 'border border-border bg-card px-2.5 py-1.5 shadow-sm';

const DEFAULT_TOOLTIP_VALUE_CLASS = 'font-mono text-sm font-bold';

const DEFAULT_TOOLTIP_DATE_CLASS = 'font-mono text-[10px] text-muted-foreground';

export const HistoryAreaChart = ({
    chartState,
    color,
    gradientId,
    valueFormatter,
    axisValueFormatter,
    heightClassName,
    chartClassName,
    yAxisWidth = 44,
    xAxisMinTickGap = 48,
    xAxisTickMargin = 6,
    yAxisTickMargin = 4,
    axisColor = 'var(--color-muted-foreground)',
    axisFontSize = 10,
    axisFontFamily = 'var(--font-mono)',
    cardStrokeColor = 'var(--color-card)',
    tooltipContainerClassName = DEFAULT_TOOLTIP_CONTAINER_CLASS,
    tooltipValueClassName = DEFAULT_TOOLTIP_VALUE_CLASS,
    tooltipDateClassName = DEFAULT_TOOLTIP_DATE_CLASS,
    margin = DEFAULT_MARGIN,
    gradientStartOpacity = 0.18,
    gradientEndOpacity = 0.01,
}: HistoryAreaChartProps) => {
    if (!chartState.hasData || !chartState.xDomain) {
        return null;
    }

    return (
        <div className={heightClassName}>
            <div className={chartClassName ?? DEFAULT_CHART_CLASS}>
                <ResponsiveContainer width='100%' height='100%'>
                    <AreaChart data={chartState.sampledPoints} margin={margin}>
                        <defs>
                            <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
                                <stop
                                    offset='0%'
                                    stopColor={color}
                                    stopOpacity={gradientStartOpacity}
                                />
                                <stop
                                    offset='100%'
                                    stopColor={color}
                                    stopOpacity={gradientEndOpacity}
                                />
                            </linearGradient>
                        </defs>
                        <XAxis
                            type='number'
                            dataKey='timestamp'
                            domain={chartState.xDomain}
                            ticks={chartState.xTicks}
                            tickFormatter={chartState.xTickFormatter}
                            axisLine={false}
                            tickLine={false}
                            minTickGap={xAxisMinTickGap}
                            tickMargin={xAxisTickMargin}
                            style={{
                                fill: axisColor,
                                fontSize: axisFontSize,
                                fontFamily: axisFontFamily,
                            }}
                        />
                        <YAxis
                            type='number'
                            domain={chartState.yScale.domain}
                            ticks={chartState.yScale.ticks}
                            width={yAxisWidth}
                            tickFormatter={(value) => axisValueFormatter(Number(value))}
                            axisLine={false}
                            tickLine={false}
                            tickMargin={yAxisTickMargin}
                            style={{
                                fill: axisColor,
                                fontSize: axisFontSize,
                                fontFamily: axisFontFamily,
                            }}
                        />
                        <Tooltip
                            isAnimationActive={false}
                            cursor={{
                                stroke: color,
                                strokeWidth: 1.5,
                                opacity: 0.3,
                            }}
                            content={
                                <HistoryAreaChartTooltip
                                    color={color}
                                    containerClassName={tooltipContainerClassName}
                                    dateClassName={tooltipDateClassName}
                                    valueClassName={tooltipValueClassName}
                                    valueFormatter={valueFormatter}
                                />
                            }
                        />
                        <Area
                            type='stepAfter'
                            dataKey='value'
                            stroke={color}
                            strokeWidth={2.5}
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            fill={`url(#${gradientId})`}
                            isAnimationActive={false}
                            dot={false}
                            activeDot={{
                                r: 4,
                                fill: color,
                                stroke: cardStrokeColor,
                                strokeWidth: 2,
                            }}
                        />
                        {chartState.latestPoint ? (
                            <ReferenceDot
                                x={chartState.latestPoint.timestamp}
                                y={chartState.latestPoint.value}
                                r={3}
                                fill={color}
                                stroke={cardStrokeColor}
                                strokeWidth={2}
                                ifOverflow='hidden'
                            />
                        ) : null}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const HistoryAreaChartTooltip = ({
    active,
    payload,
    color,
    valueFormatter,
    containerClassName,
    valueClassName,
    dateClassName,
}: {
    active?: boolean;
    payload?: Array<{ payload?: TooltipDatum }>;
    color: string;
    valueFormatter: (value: number) => string;
    containerClassName: string;
    valueClassName: string;
    dateClassName: string;
}) => {
    const point = payload?.[0]?.payload;
    if (!active || !point) {
        return null;
    }

    return (
        <div className={containerClassName}>
            <p className={valueClassName} style={{ color }}>
                {valueFormatter(point.value)}
            </p>
            <p className={dateClassName}>{formatDateTooltip(point.timestamp)}</p>
        </div>
    );
};
