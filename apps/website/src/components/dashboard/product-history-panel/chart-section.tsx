import { useMemo } from 'react';
import {
    Area,
    AreaChart,
    ReferenceDot,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { buildPoints } from '@/components/dashboard/product-history-panel/chart-data';
import {
    buildEvenYAxisScale,
    downsamplePoints,
    formatAxisValue,
    formatDateShort,
    formatValue,
    MAX_CHART_POINTS,
} from '@/components/dashboard/product-history-panel/chart-utils';
import {
    buildXAxisFormatter,
    buildXAxisTicks,
} from '@/components/dashboard/product-history-panel/chart-x-axis';
import { ChartSkeleton } from '@/components/dashboard/product-history-panel/syncing-chart-placeholder';
import type {
    HistoryQueryResult,
    HistoryTimeDomain,
    SelectOption,
} from '@/components/dashboard/product-history-panel/types';
import {
    Select,
    SelectItem,
    SelectPopup,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type ChartSectionProps = {
    label: string;
    selectValue: string;
    onSelectChange: (value: string) => void;
    selectOptions: SelectOption[];
    query: HistoryQueryResult;
    metric: string;
    isPrice: boolean;
    gradientId: string;
    isSyncing?: boolean;
    timeDomain?: HistoryTimeDomain | null;
};

type ChartDatum = {
    timestamp: number;
    value: number;
};

export const ChartSection = ({
    label,
    selectValue,
    onSelectChange,
    selectOptions,
    query,
    metric,
    isPrice,
    gradientId,
    isSyncing,
    timeDomain,
}: ChartSectionProps) => {
    const points = useMemo(
        () =>
            buildPoints({
                query,
                timeDomain,
            }),
        [query, timeDomain],
    );
    const sampledPoints = useMemo(
        () => downsamplePoints(points, MAX_CHART_POINTS),
        [points],
    );
    const latestPoint = sampledPoints.at(-1) ?? null;
    const firstPoint = sampledPoints[0] ?? null;
    const rangeStartTimestamp =
        timeDomain?.startAt ?? firstPoint?.timestamp ?? null;
    const rangeEndTimestamp =
        timeDomain?.endAt ?? latestPoint?.timestamp ?? null;

    const selectedOptionLabel = useMemo(
        () =>
            selectOptions.find((option) => option.value === selectValue)
                ?.label ?? selectValue,
        [selectOptions, selectValue],
    );

    const isLoading = query.isLoading && !query.data;
    const hasData = sampledPoints.length > 0;
    const color = isPrice
        ? 'var(--color-chart-4)'
        : 'var(--color-chart-1)';
    const xDomain = useMemo<[number, number] | undefined>(() => {
        if (rangeStartTimestamp === null || rangeEndTimestamp === null) {
            return undefined;
        }

        const min = Math.min(rangeStartTimestamp, rangeEndTimestamp);
        const max = Math.max(rangeStartTimestamp, rangeEndTimestamp);
        if (min === max) {
            return [min - ONE_DAY_IN_MS, max + ONE_DAY_IN_MS];
        }
        return [min, max];
    }, [rangeEndTimestamp, rangeStartTimestamp]);
    const yScale = useMemo(
        () =>
            buildEvenYAxisScale(
                sampledPoints.map((point) => point.value),
                { min: 0, tickCount: 5 },
            ),
        [sampledPoints],
    );

    const xTicks = useMemo(() => {
        if (!xDomain) {
            return undefined;
        }
        return buildXAxisTicks(xDomain[0], xDomain[1]);
    }, [xDomain]);

    const xTickFormatter = useMemo(() => {
        if (!xDomain) {
            return formatDateShort;
        }
        return buildXAxisFormatter(xDomain[0], xDomain[1]);
    }, [xDomain]);

    const chartData = sampledPoints as ChartDatum[];

    return (
        <div className="border-b border-border bg-card">
            <div className="flex h-8 items-center justify-between border-b border-border bg-muted/30 pl-3 pr-1.5">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                </span>
                {selectOptions.length > 0 ? (
                    <Select
                        value={selectValue}
                        onValueChange={(value) => {
                            if (value) {
                                onSelectChange(value);
                            }
                        }}
                    >
                        <SelectTrigger
                            size="sm"
                            className="h-5 w-auto border-0 bg-transparent px-1 font-mono text-[11px] shadow-none"
                        >
                            <SelectValue>
                                {selectedOptionLabel}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectPopup>
                            {selectOptions.map((option) => (
                                <SelectItem
                                    key={option.value}
                                    value={option.value}
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectPopup>
                    </Select>
                ) : null}
            </div>
            <div>
                {query.isError ? (
                    <div className="mx-3 my-3 border border-red-200 bg-red-50/50 p-2 font-mono text-xs text-red-700">
                        {query.error?.message}
                    </div>
                ) : !isLoading &&
                  !hasData &&
                  !isSyncing ? (
                    <div className="flex items-center justify-center py-6">
                        <p className="font-mono text-xs text-muted-foreground">
                            No data for this range.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-baseline gap-2.5 px-3 pt-2 pb-1">
                            {isLoading || (!hasData && isSyncing) ? (
                                <ChartSkeleton variant="header" />
                            ) : (
                                <>
                                    <p
                                        className="font-mono text-xl font-bold tracking-tight"
                                        style={{ color }}
                                    >
                                        {latestPoint
                                            ? formatValue(
                                                  metric,
                                                  latestPoint.value,
                                              )
                                            : '-'}
                                    </p>
                                    {rangeStartTimestamp !== null &&
                                    rangeEndTimestamp !== null ? (
                                        <p className="font-mono text-[10px] text-muted-foreground">
                                            {formatDateShort(
                                                rangeStartTimestamp,
                                            )}{' '}
                                            &ndash;{' '}
                                            {formatDateShort(
                                                rangeEndTimestamp,
                                            )}
                                        </p>
                                    ) : null}
                                </>
                            )}
                        </div>
                        <div className="h-[180px]">
                            {isLoading || (!hasData && isSyncing) ? (
                                <ChartSkeleton variant="chart" />
                            ) : hasData ? (
                                <div className="h-full cursor-crosshair">
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                    >
                                        <AreaChart
                                            data={chartData}
                                            margin={{
                                                top: 4,
                                                right: 36,
                                                bottom: 4,
                                                left: 0,
                                            }}
                                        >
                                            <defs>
                                                <linearGradient
                                                    id={gradientId}
                                                    x1="0"
                                                    y1="0"
                                                    x2="0"
                                                    y2="1"
                                                >
                                                    <stop
                                                        offset="0%"
                                                        stopColor={color}
                                                        stopOpacity="0.18"
                                                    />
                                                    <stop
                                                        offset="100%"
                                                        stopColor={color}
                                                        stopOpacity="0.01"
                                                    />
                                                </linearGradient>
                                            </defs>
                                            <XAxis
                                                type="number"
                                                dataKey="timestamp"
                                                domain={
                                                    xDomain ?? [
                                                        'auto',
                                                        'auto',
                                                    ]
                                                }
                                                ticks={xTicks}
                                                tickFormatter={xTickFormatter}
                                                axisLine={false}
                                                tickLine={false}
                                                minTickGap={48}
                                                tickMargin={6}
                                                style={{
                                                    fill: 'var(--color-muted-foreground)',
                                                    fontSize: 10,
                                                    fontFamily:
                                                        'var(--font-mono)',
                                                }}
                                            />
                                            <YAxis
                                                type="number"
                                                domain={yScale.domain}
                                                ticks={yScale.ticks}
                                                width={44}
                                                tickFormatter={(value) =>
                                                    formatAxisValue(
                                                        metric,
                                                        Number(value),
                                                    )
                                                }
                                                axisLine={false}
                                                tickLine={false}
                                                tickMargin={4}
                                                style={{
                                                    fill: 'var(--color-muted-foreground)',
                                                    fontSize: 10,
                                                    fontFamily:
                                                        'var(--font-mono)',
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
                                                    <HistoryTooltip
                                                        metric={metric}
                                                        color={color}
                                                    />
                                                }
                                            />
                                            <Area
                                                type="stepAfter"
                                                dataKey="value"
                                                stroke={color}
                                                strokeWidth={2.5}
                                                fill={`url(#${gradientId})`}
                                                isAnimationActive={false}
                                                dot={false}
                                                activeDot={{
                                                    r: 4,
                                                    fill: color,
                                                    stroke: 'var(--color-card)',
                                                    strokeWidth: 2,
                                                }}
                                            />
                                            {latestPoint ? (
                                                <ReferenceDot
                                                    x={
                                                        latestPoint.timestamp
                                                    }
                                                    y={latestPoint.value}
                                                    r={3}
                                                    fill={color}
                                                    stroke="var(--color-card)"
                                                    strokeWidth={2}
                                                    ifOverflow="hidden"
                                                />
                                            ) : null}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : null}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

const HistoryTooltip = ({
    active,
    payload,
    metric,
    color,
}: {
    active?: boolean;
    payload?: Array<{ payload?: ChartDatum }>;
    metric: string;
    color: string;
}) => {
    const point = payload?.[0]?.payload;
    if (!active || !point) {
        return null;
    }

    return (
        <div className="border border-border bg-card px-2.5 py-1.5 shadow-sm">
            <p
                className="font-mono text-sm font-bold"
                style={{ color }}
            >
                {formatValue(metric, point.value)}
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
                {formatDateShort(point.timestamp)}
            </p>
        </div>
    );
};
