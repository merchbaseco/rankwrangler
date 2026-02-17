import { useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/trpc';
import { cn } from '@/lib/utils';

const HISTORY_METRICS = [
    { key: 'bsrMain', label: 'BSR' },
    { key: 'bsrCategory', label: 'BSR Category' },
    { key: 'priceAmazon', label: 'Amazon Price' },
    { key: 'priceNew', label: 'New Price' },
    { key: 'priceNewFba', label: 'FBA New Price' },
] as const;

type HistoryMetricKey = (typeof HISTORY_METRICS)[number]['key'];

type HistoryPoint = {
    timestamp: number;
    value: number;
};

type CategoryOption = {
    id: number;
    name: string | null;
};

type ProductHistoryPanelProps = {
    product: {
        asin: string;
        marketplaceId: string;
        title: string | null;
    };
};

const MAX_CHART_POINTS = 320;
const CHART_WIDTH = 1000;
const CHART_HEIGHT = 220;
const CHART_PADDING_LEFT = 22;
const CHART_PADDING_RIGHT = 14;
const CHART_PADDING_TOP = 12;
const CHART_PADDING_BOTTOM = 20;

export function ProductHistoryPanel({ product }: ProductHistoryPanelProps) {
    const [metric, setMetric] = useState<HistoryMetricKey>('bsrMain');
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

    const categoryOptionsQuery = api.api.app.getProductHistory.useQuery(
        {
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            metric: 'bsrCategory',
            limit: 10_000,
        },
        {
            enabled: metric === 'bsrCategory',
            refetchOnWindowFocus: false,
            staleTime: 30_000,
        }
    );

    const availableCategories = useMemo(() => {
        if (!categoryOptionsQuery.data) {
            return [] as CategoryOption[];
        }

        const categoryMap = new Map<number, string | null>();
        for (const point of categoryOptionsQuery.data.points) {
            if (!Number.isFinite(point.categoryId) || point.categoryId <= 0) {
                continue;
            }

            const categoryId = point.categoryId;
            const categoryName =
                categoryOptionsQuery.data.categoryNames[String(categoryId)] ?? null;
            if (!categoryMap.has(categoryId) || categoryName) {
                categoryMap.set(categoryId, categoryName);
            }
        }

        return Array.from(categoryMap.entries())
            .sort((left, right) => left[0] - right[0])
            .map(([id, name]) => ({ id, name }));
    }, [categoryOptionsQuery.data]);

    const effectiveCategoryId =
        metric !== 'bsrCategory'
            ? undefined
            : typeof selectedCategoryId === 'number' &&
                availableCategories.some(category => category.id === selectedCategoryId)
              ? selectedCategoryId
              : availableCategories[0]?.id;

    const historyQueryInput = useMemo(
        () => ({
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            metric,
            limit: 5000,
            ...(metric === 'bsrCategory' && typeof effectiveCategoryId === 'number'
                ? { categoryId: effectiveCategoryId }
                : {}),
        }),
        [effectiveCategoryId, metric, product.asin, product.marketplaceId]
    );

    const historyQuery = api.api.app.getProductHistory.useQuery(
        historyQueryInput,
        {
            enabled: metric !== 'bsrCategory' || typeof effectiveCategoryId === 'number',
            refetchOnWindowFocus: false,
            staleTime: 30_000,
        }
    );

    const loadMutation = api.api.app.loadProductHistory.useMutation({
        onSuccess: async () => {
            await Promise.all([historyQuery.refetch(), categoryOptionsQuery.refetch()]);
        },
    });

    const points = useMemo(() => {
        if (!historyQuery.data) {
            return [] as HistoryPoint[];
        }

        return historyQuery.data.points
            .filter(
                point =>
                    !point.isMissing &&
                    typeof point.value === 'number' &&
                    Number.isFinite(point.value)
            )
            .map(point => ({
                timestamp: Date.parse(point.observedAt),
                value: point.value as number,
            }))
            .filter(point => Number.isFinite(point.timestamp));
    }, [historyQuery.data]);

    const sampledPoints = useMemo(
        () => downsamplePoints(points, MAX_CHART_POINTS),
        [points]
    );

    const chartGeometry = useMemo(
        () => buildChartGeometry(sampledPoints),
        [sampledPoints]
    );

    const metricMeta =
        HISTORY_METRICS.find(candidate => candidate.key === metric) ??
        HISTORY_METRICS[0];

    const latestPoint = points.at(-1) ?? null;
    const firstPoint = points[0] ?? null;
    const missingCount = (historyQuery.data?.points.length ?? 0) - points.length;
    const gradientId = `history-gradient-${product.asin}-${metric}`;

    const handleGenerate = () => {
        if (loadMutation.isPending) {
            return;
        }

        loadMutation.mutate({
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            days: 365,
        });
    };

    return (
        <div className="min-h-full bg-[#FCFCFC] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#78716C]">
                        History
                    </p>
                    <p className="mt-1 font-mono text-xs text-[#57534E]">
                        {product.asin}
                    </p>
                    <p className="line-clamp-1 text-sm font-semibold text-[#1C1917]">
                        {product.title ?? 'Untitled'}
                    </p>
                </div>

                <div className="flex items-center gap-2 pr-10">
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={loadMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#141210] px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {loadMutation.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="size-3.5" />
                        )}
                        {loadMutation.isPending ? 'Generating...' : 'Generate (365d)'}
                    </button>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {HISTORY_METRICS.map(option => (
                    <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                            setMetric(option.key);
                            if (option.key !== 'bsrCategory') {
                                setSelectedCategoryId(null);
                            }
                        }}
                        className={cn(
                            'rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors',
                            option.key === metric
                                ? 'border-[#25211d] bg-[#25211d] text-white'
                                : 'border-border bg-white text-[#57534E] hover:bg-[#F5F5F4]'
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {metric === 'bsrCategory' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label
                        htmlFor="bsr-category-select"
                        className="text-xs font-medium text-[#57534E]"
                    >
                        Category
                    </label>
                    <select
                        id="bsr-category-select"
                        value={typeof effectiveCategoryId === 'number' ? String(effectiveCategoryId) : ''}
                        onChange={event => {
                            setSelectedCategoryId(Number(event.target.value));
                        }}
                        className="rounded-md border border-border bg-white px-2 py-1 text-xs text-[#1C1917] focus:outline-none"
                        disabled={categoryOptionsQuery.isLoading || availableCategories.length === 0}
                    >
                        {availableCategories.length === 0 ? (
                            <option value="">No categories</option>
                        ) : (
                            availableCategories.map(category => (
                                <option key={category.id} value={String(category.id)}>
                                    {formatCategoryLabel(category.id, category.name)}
                                </option>
                            ))
                        )}
                    </select>
                </div>
            )}

            {loadMutation.isSuccess && (
                <p className="mt-2 text-xs font-medium text-emerald-700">
                    Synced {loadMutation.data.pointsStored.toLocaleString()} points from
                    Keepa.
                </p>
            )}

            {loadMutation.isError && (
                <p className="mt-2 text-xs font-medium text-red-700">
                    {loadMutation.error.message}
                </p>
            )}

            <div className="mt-3 rounded-xl border border-border bg-white p-3">
                {historyQuery.isLoading && !historyQuery.data ? (
                    <div className="space-y-2">
                        <div className="h-5 w-44 animate-pulse rounded bg-muted" />
                        <div className="h-48 animate-pulse rounded-lg bg-muted" />
                        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                    </div>
                ) : metric === 'bsrCategory' &&
                  categoryOptionsQuery.isLoading &&
                  availableCategories.length === 0 ? (
                    <div className="space-y-2">
                        <div className="h-5 w-44 animate-pulse rounded bg-muted" />
                        <div className="h-48 animate-pulse rounded-lg bg-muted" />
                        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                    </div>
                ) : metric === 'bsrCategory' && availableCategories.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-[#FAFAF9] p-4">
                        <p className="text-sm font-medium text-[#292524]">
                            No stored bsr category points yet.
                        </p>
                        <p className="mt-1 text-xs text-[#78716C]">
                            Click Generate to fetch and persist history for this ASIN.
                        </p>
                    </div>
                ) : historyQuery.isError ? (
                    <p className="text-sm font-medium text-red-700">
                        {historyQuery.error.message}
                    </p>
                ) : points.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-[#FAFAF9] p-4">
                        <p className="text-sm font-medium text-[#292524]">
                            No stored {metricMeta.label.toLowerCase()} points yet.
                        </p>
                        <p className="mt-1 text-xs text-[#78716C]">
                            Click Generate to fetch and persist history for this ASIN.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#78716C]">
                            <span>
                                {historyQuery.data?.points.length.toLocaleString()} points
                                {missingCount > 0
                                    ? ` (${missingCount.toLocaleString()} missing)`
                                    : ''}
                            </span>
                            <span>
                                {firstPoint && latestPoint
                                    ? `${formatDateLabel(firstPoint.timestamp)} to ${formatDateLabel(latestPoint.timestamp)}`
                                    : ''}
                            </span>
                        </div>

                        {chartGeometry && (
                            <svg
                                className="h-52 w-full"
                                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                                preserveAspectRatio="none"
                            >
                                <defs>
                                    <linearGradient
                                        id={gradientId}
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1"
                                    >
                                        <stop offset="0%" stopColor="#1f2937" stopOpacity="0.16" />
                                        <stop offset="100%" stopColor="#1f2937" stopOpacity="0" />
                                    </linearGradient>
                                </defs>

                                {[0, 0.25, 0.5, 0.75, 1].map(position => {
                                    const y =
                                        CHART_PADDING_TOP +
                                        position *
                                            (CHART_HEIGHT -
                                                CHART_PADDING_TOP -
                                                CHART_PADDING_BOTTOM);
                                    return (
                                        <line
                                            key={position}
                                            x1={CHART_PADDING_LEFT}
                                            x2={CHART_WIDTH - CHART_PADDING_RIGHT}
                                            y1={y}
                                            y2={y}
                                            stroke="#E7E5E4"
                                            strokeWidth="1"
                                        />
                                    );
                                })}

                                <path d={chartGeometry.areaPath} fill={`url(#${gradientId})`} />

                                <path
                                    d={chartGeometry.linePath}
                                    fill="none"
                                    stroke="#1f2937"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                />

                                <circle
                                    cx={chartGeometry.lastX}
                                    cy={chartGeometry.lastY}
                                    r="3.5"
                                    fill="#111827"
                                />
                            </svg>
                        )}

                        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#57534E]">
                            <span>
                                Latest:{' '}
                                <strong className="font-semibold text-[#1C1917]">
                                    {latestPoint
                                        ? formatMetricValue(metric, latestPoint.value)
                                        : '-'}
                                </strong>
                            </span>
                            <span>
                                Min:{' '}
                                <strong className="font-semibold text-[#1C1917]">
                                    {chartGeometry
                                        ? formatMetricValue(metric, chartGeometry.minValue)
                                        : '-'}
                                </strong>
                            </span>
                            <span>
                                Max:{' '}
                                <strong className="font-semibold text-[#1C1917]">
                                    {chartGeometry
                                        ? formatMetricValue(metric, chartGeometry.maxValue)
                                        : '-'}
                                </strong>
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const downsamplePoints = (points: HistoryPoint[], maxPoints: number) => {
    if (points.length <= maxPoints) {
        return points;
    }

    const step = Math.max(1, Math.floor(points.length / maxPoints));
    const sampled: HistoryPoint[] = [];

    for (let index = 0; index < points.length; index += step) {
        const point = points[index];
        if (point) {
            sampled.push(point);
        }
    }

    const lastPoint = points.at(-1);
    const sampledLast = sampled.at(-1);
    if (lastPoint && sampledLast?.timestamp !== lastPoint.timestamp) {
        sampled.push(lastPoint);
    }

    return sampled;
};

const buildChartGeometry = (points: HistoryPoint[]) => {
    if (points.length === 0) {
        return null;
    }

    const timestamps = points.map(point => point.timestamp);
    const values = points.map(point => point.value);

    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const innerWidth = CHART_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
    const innerHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

    const timestampRange = Math.max(1, maxTimestamp - minTimestamp);
    const valueRange = Math.max(1, maxValue - minValue);

    const toX = (timestamp: number) =>
        CHART_PADDING_LEFT +
        ((timestamp - minTimestamp) / timestampRange) * innerWidth;

    const toY = (value: number) =>
        CHART_PADDING_TOP + ((maxValue - value) / valueRange) * innerHeight;

    const linePath = points
        .map((point, index) => {
            const prefix = index === 0 ? 'M' : 'L';
            return `${prefix} ${toX(point.timestamp)} ${toY(point.value)}`;
        })
        .join(' ');

    const firstPoint = points[0];
    const lastPoint = points.at(-1);

    if (!firstPoint || !lastPoint) {
        return null;
    }

    const baselineY = CHART_HEIGHT - CHART_PADDING_BOTTOM;
    const firstX = toX(firstPoint.timestamp);
    const lastX = toX(lastPoint.timestamp);
    const lastY = toY(lastPoint.value);
    const areaPath = `${linePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;

    return {
        linePath,
        areaPath,
        minValue,
        maxValue,
        lastX,
        lastY,
    };
};

const formatMetricValue = (metric: HistoryMetricKey, value: number) => {
    if (metric === 'priceAmazon' || metric === 'priceNew' || metric === 'priceNewFba') {
        return `$${(value / 100).toFixed(2)}`;
    }

    return `#${value.toLocaleString()}`;
};

const formatDateLabel = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(new Date(timestamp));
};

const formatCategoryLabel = (categoryId: number, categoryName: string | null) => {
    return categoryName ?? `#${categoryId.toLocaleString()}`;
};
