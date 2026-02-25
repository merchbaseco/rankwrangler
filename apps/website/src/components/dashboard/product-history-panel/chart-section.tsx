import { HistoryAreaChart } from '@rankwrangler/history-chart/history-area-chart';
import {
    buildHistoryChartState,
    formatDateTooltip,
    MAX_CHART_POINTS,
} from '@rankwrangler/history-chart/history-chart-utils';
import { useMemo } from 'react';
import { buildPoints } from '@/components/dashboard/product-history-panel/chart-data';
import { formatAxisValue, formatValue } from '@/components/dashboard/product-history-panel/chart-utils';
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
    const points = useMemo(() => buildPoints({ query }), [query]);
    const chartState = useMemo(
        () =>
            buildHistoryChartState({
                points,
                timeDomain,
                maxPoints: MAX_CHART_POINTS,
                yMin: 0,
                yTickCount: 5,
            }),
        [points, timeDomain],
    );

    const selectedOptionLabel = useMemo(
        () =>
            selectOptions.find((option) => option.value === selectValue)
                ?.label ?? selectValue,
        [selectOptions, selectValue],
    );

    const isLoading = query.isLoading && !query.data;
    const hasData = chartState.hasData;
    const latestPoint = chartState.latestPoint;
    const rangeStartTimestamp = chartState.rangeStartTimestamp;
    const rangeEndTimestamp = chartState.rangeEndTimestamp;
    const color = isPrice ? 'var(--color-chart-4)' : 'var(--color-chart-1)';

    return (
        <div className='border-b border-border bg-card'>
            <div className='flex h-8 items-center justify-between border-b border-border bg-muted/30 pl-3 pr-1.5'>
                <span className='font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
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
                            size='sm'
                            className='h-5 w-auto border-0 bg-transparent px-1 font-mono text-[11px] shadow-none'
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
                    <div className='mx-3 my-3 border border-red-200 bg-red-50/50 p-2 font-mono text-xs text-red-700'>
                        {query.error?.message}
                    </div>
                ) : !isLoading &&
                  !hasData &&
                  !isSyncing ? (
                    <div className='flex items-center justify-center py-6'>
                        <p className='font-mono text-xs text-muted-foreground'>
                            No data for this range.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className='flex items-baseline gap-2.5 px-3 pt-2 pb-1'>
                            {isLoading || (!hasData && isSyncing) ? (
                                <ChartSkeleton variant='header' />
                            ) : (
                                <>
                                    <p
                                        className='font-mono text-xl font-bold tracking-tight'
                                        style={{ color }}
                                    >
                                        {latestPoint
                                            ? formatValue(metric, latestPoint.value)
                                            : '-'}
                                    </p>
                                    {rangeStartTimestamp !== null &&
                                    rangeEndTimestamp !== null ? (
                                        <p className='font-mono text-[10px] text-muted-foreground'>
                                            {formatDateTooltip(rangeStartTimestamp)}
                                            {' '}
                                            &ndash;
                                            {' '}
                                            {formatDateTooltip(rangeEndTimestamp)}
                                        </p>
                                    ) : null}
                                </>
                            )}
                        </div>
                        <div>
                            {isLoading || (!hasData && isSyncing) ? (
                                <ChartSkeleton variant='chart' />
                            ) : hasData ? (
                                <HistoryAreaChart
                                    chartState={chartState}
                                    color={color}
                                    gradientId={gradientId}
                                    valueFormatter={(value) =>
                                        formatValue(metric, value)
                                    }
                                    axisValueFormatter={(value) =>
                                        formatAxisValue(metric, value)
                                    }
                                    heightClassName='h-[180px]'
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
                            ) : null}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
