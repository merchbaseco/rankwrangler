import { HistoryAreaChart } from '@rankwrangler/history-chart/history-area-chart';
import {
    buildHistoryChartState,
    formatRankAxisValue,
    formatRankValue,
    MAX_CHART_POINTS,
    type HistoryChartPoint,
} from '@rankwrangler/history-chart/history-chart-utils';
import { useId, useMemo } from 'react';
import { cn } from '@/lib/utils';

export type TrendMetric = 'searchFrequencyRank' | 'clickShareTop3Sum' | 'conversionShareTop3Sum';

export type TrendPoint = {
    observedDate: string;
    searchFrequencyRank: number;
    clickShareTop3Sum: number;
    conversionShareTop3Sum: number;
};

export const TrendChart = ({
    metric,
    points,
    className,
}: {
    metric: TrendMetric;
    points: TrendPoint[];
    className?: string;
}) => {
    const chartPoints = useMemo<HistoryChartPoint[]>(
        () =>
            points
                .map((point) => ({
                    timestamp: Date.parse(point.observedDate),
                    value: point[metric],
                }))
                .filter(
                    (point) =>
                        Number.isFinite(point.timestamp) &&
                        Number.isFinite(point.value),
                )
                .sort((left, right) => left.timestamp - right.timestamp),
        [metric, points],
    );
    const chartState = useMemo(
        () =>
            buildHistoryChartState({
                points: chartPoints,
                maxPoints: MAX_CHART_POINTS,
                yMin: 0,
                yTickCount: 5,
            }),
        [chartPoints],
    );
    const gradientId = useId();

    if (!chartState.hasData) {
        return (
            <div
                className={cn(
                    'text-muted-foreground flex h-full items-center justify-center text-sm',
                    className
                )}
            >
                No trend history available for this term yet.
            </div>
        );
    }

    return (
        <HistoryAreaChart
            chartState={chartState}
            color='var(--color-chart-1)'
            gradientId={gradientId}
            valueFormatter={(value) => formatMetricValue(value, metric)}
            axisValueFormatter={(value) => formatMetricAxisValue(value, metric)}
            heightClassName={cn('h-full', className)}
            chartClassName='h-full cursor-crosshair'
            yAxisWidth={44}
            xAxisMinTickGap={48}
            xAxisTickMargin={6}
            yAxisTickMargin={4}
            axisColor='var(--color-muted-foreground)'
            axisFontSize={10}
            axisFontFamily='var(--font-mono)'
            cardStrokeColor='var(--color-card)'
            tooltipContainerClassName='border border-border bg-card px-2.5 py-1.5 shadow-sm'
            tooltipValueClassName='font-mono text-sm font-bold'
            tooltipDateClassName='font-mono text-[10px] text-muted-foreground'
            margin={{
                top: 4,
                right: 36,
                bottom: 4,
                left: 0,
            }}
        />
    );
};

const formatMetricValue = (value: number, metric: TrendMetric) => {
    if (metric === 'searchFrequencyRank') {
        return formatRankValue(Math.round(value));
    }

    return `${(value * 100).toFixed(2)}%`;
};

const formatMetricAxisValue = (value: number, metric: TrendMetric) => {
    if (metric === 'searchFrequencyRank') {
        return formatRankAxisValue(value);
    }

    const percentage = value * 100;
    if (percentage >= 10) {
        return `${Math.round(percentage)}%`;
    }
    if (percentage >= 1) {
        return `${percentage.toFixed(1)}%`;
    }

    return `${percentage.toFixed(2)}%`;
};
