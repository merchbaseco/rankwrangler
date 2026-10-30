import { BarChart } from '@heroui-pro/react/bar-chart';
import type { RouterOutputs } from '@/lib/trpc';
import { type EventRange, formatBucket } from './event-range';
import { formatCount } from './status-model';

type Histogram = RouterOutputs['api']['app']['eventLogHistogram'];

/**
 * Events over the chosen range, one bar per bucket stacked by level. Routine levels sit quiet
 * at the bottom; warnings and errors stack on top in their own colours, so trouble shows as a
 * coloured cap on the bar it happened in.
 */
export const EventHistogram = ({
    histogram,
    range,
}: {
    histogram: Histogram | undefined;
    range: EventRange;
}) => {
    const data = (histogram?.buckets ?? []).map(bucket => ({
        ...bucket,
        label: formatBucket(bucket.start, range),
    }));
    return (
        <div aria-label={describe(histogram)} className="status-histogram" role="img">
            <BarChart data={data} height={128} margin={{ bottom: 0, left: 0, right: 0, top: 4 }}>
                <BarChart.Grid vertical={false} />
                <BarChart.XAxis
                    dataKey="label"
                    interval="preserveStartEnd"
                    minTickGap={48}
                    tickMargin={6}
                />
                <BarChart.YAxis allowDecimals={false} width={36} />
                {levels.map((level, index) => (
                    <BarChart.Bar
                        dataKey={level.key}
                        fill={level.fill}
                        isAnimationActive={false}
                        key={level.key}
                        name={level.label}
                        radius={index === levels.length - 1 ? [2, 2, 0, 0] : 0}
                        stackId="events"
                    />
                ))}
                <BarChart.Tooltip
                    content={
                        <BarChart.TooltipContent valueFormatter={v => formatCount(Number(v))} />
                    }
                />
            </BarChart>
        </div>
    );
};

const levels = [
    { fill: 'var(--status-event-debug)', key: 'debug', label: 'Debug' },
    { fill: 'var(--status-event-info)', key: 'info', label: 'Info' },
    { fill: 'var(--warning)', key: 'warn', label: 'Warn' },
    { fill: 'var(--danger)', key: 'error', label: 'Error' },
] as const;

const describe = (histogram: Histogram | undefined) => {
    if (!histogram) {
        return 'Events over time';
    }
    const sum = (key: 'error' | 'warn') =>
        histogram.buckets.reduce((total, bucket) => total + bucket[key], 0);
    const errors = formatCount(sum('error'));
    const warnings = formatCount(sum('warn'));
    return `${formatCount(histogram.total)} events, ${errors} errors and ${warnings} warnings`;
};
