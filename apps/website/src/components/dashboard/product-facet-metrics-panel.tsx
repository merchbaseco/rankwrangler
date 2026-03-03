import { api } from '@/lib/trpc';
import { cn, formatNumber } from '@/lib/utils';

const SETTINGS_METRICS_POLL_INTERVAL_MS = 10_000;
const FACET_CARD_COLUMNS = 6;
const MIN_VISIBLE_USD_SPEND = 0.01;
const FACET_DISPLAY_NAMES: Record<string, string> = {
    profession: 'Profession',
    hobby: 'Hobby',
    animal: 'Animal',
    food: 'Food',
    cause: 'Cause',
    identity: 'Identity',
    culture: 'Culture',
    holiday: 'Holiday',
    occasion: 'Occasion',
    place: 'Place',
    'party-theme': 'Party Theme',
};

type StatType = 'neutral' | 'success' | 'error';

const STAT_STYLES: Record<StatType, { color: string; stroke: string }> = {
    neutral: { color: 'text-foreground', stroke: 'var(--color-foreground)' },
    success: { color: 'text-success-foreground', stroke: 'var(--color-success)' },
    error: { color: 'text-destructive', stroke: 'var(--color-destructive)' },
};

export const ProductFacetMetricsPanel = () => {
    const metricsQuery = api.api.app.getProductFacetMetricsSummary.useQuery(undefined, {
        refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        retry: false,
    });

    if (metricsQuery.isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading facet metrics…</p>
            </div>
        );
    }

    if (metricsQuery.error || !metricsQuery.data) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-destructive">Failed to load facet metrics.</p>
            </div>
        );
    }

    const { stats, facetCategoryTotals, facetValueTotals } = metricsQuery.data;

    return (
        <div className="flex h-full flex-col">
            <div className="grid grid-cols-3">
                {stats.map((stat, index) => {
                    const statType = getStatType(stat.label);
                    const style = STAT_STYLES[statType];

                    return (
                        <div
                            key={stat.label}
                            className={cn(
                                'flex flex-col justify-between p-3',
                                index < stats.length - 1 && 'border-r border-border'
                            )}
                        >
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                {stat.label}
                            </p>
                            <p className={cn('stat-value font-mono text-2xl font-bold', style.color)}>
                                {stat.format === 'usd'
                                    ? formatUsd(stat.total)
                                    : formatNumber(stat.total)}
                            </p>
                            <Sparkline buckets={stat.buckets} stroke={style.stroke} id={stat.label} />
                        </div>
                    );
                })}
            </div>

            <div className="border-t border-border">
                <div
                    className={cn(
                        'grid',
                        FACET_CARD_COLUMNS === 6
                            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
                            : 'grid-cols-4'
                    )}
                >
                    {facetCategoryTotals.map((category) => (
                        <div
                            key={category.facet}
                            className="border-b border-r border-border px-3 py-2.5"
                        >
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                {FACET_DISPLAY_NAMES[category.facet] ?? category.facet}
                            </p>
                            <p className="mt-1 font-mono text-lg font-semibold text-foreground">
                                {formatNumber(category.productCount)}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col border-t border-border">
                <div className="border-b border-border bg-accent px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Facet Values
                    </p>
                </div>
                {facetValueTotals.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                        No facet values assigned yet.
                    </p>
                ) : (
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-accent">
                                <tr className="border-b border-border">
                                    <th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                        Category
                                    </th>
                                    <th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                        Facet
                                    </th>
                                    <th className="px-3 py-1.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                        Products
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {facetValueTotals.map((facetValue) => (
                                    <tr
                                        key={`${facetValue.facet}:${facetValue.name}`}
                                        className="border-b border-border last:border-0 hover:bg-muted/30"
                                    >
                                        <td className="whitespace-nowrap px-3 py-1 font-mono text-muted-foreground">
                                            {FACET_DISPLAY_NAMES[facetValue.facet] ?? facetValue.facet}
                                        </td>
                                        <td className="max-w-[320px] truncate px-3 py-1 font-mono text-foreground">
                                            {facetValue.name}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-1 text-right font-mono text-foreground">
                                            {formatNumber(facetValue.productCount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

const getStatType = (label: string): StatType => {
    if (label.includes('Assigned')) return 'success';
    if (label.includes('Errors')) return 'error';
    return 'neutral';
};

const formatUsd = (value: number) => {
    const displayValue =
        value > 0 && value < MIN_VISIBLE_USD_SPEND ? MIN_VISIBLE_USD_SPEND : value;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
    }).format(displayValue);
};

const VB_W = 200;
const VB_H = 32;

const Sparkline = ({
    buckets,
    stroke,
    id,
}: {
    buckets: number[];
    stroke: string;
    id: string;
}) => {
    if (buckets.length === 0) return null;

    const max = Math.max(...buckets, 1);
    const stepX = VB_W / (buckets.length - 1 || 1);
    const gradientId = `spark-${id.replace(/\s+/g, '-')}`;

    const points = buckets.map((v, i) => ({
        x: i * stepX,
        y: VB_H - (v / max) * VB_H * 0.85 - VB_H * 0.05,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L${VB_W},${VB_H} L0,${VB_H} Z`;

    return (
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="mt-1.5 h-6 w-full" preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity="0.12" />
                    <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path
                d={linePath}
                fill="none"
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.6"
            />
        </svg>
    );
};
