import { z } from 'zod';
import { publicApiProcedure } from '@/api/trpc.js';
import {
    triggerKeepaProductHistoryManualLoad,
} from '@/services/keepa-manual-load.js';
import { getProductHistoryPoints, type KeepaHistoryMetricKey } from '@/services/keepa.js';
import { consumeLicenseUsageOrThrow } from './consume-license-usage.js';

const publicHistoryMetrics = ['bsr', 'price'] as const;
const publicHistoryFormat = ['legacy', 'agent'] as const;

type PublicHistoryMetric = (typeof publicHistoryMetrics)[number];

type HistoryPointTuple = [string, number | null] | [string, null, 1];

const getProductHistoryInput = z
    .object({
        marketplaceId: z.string().min(1, 'Marketplace ID is required'),
        asin: z
            .string()
            .min(1, 'ASIN is required')
            .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
            .transform(value => value.toUpperCase()),
        startAt: z.coerce.date().optional(),
        endAt: z.coerce.date().optional(),
        limit: z.coerce.number().int().min(1).max(10000).default(5000),
        days: z.coerce.number().int().min(30).max(3650).default(365),
        metrics: z.array(z.enum(publicHistoryMetrics)).min(1).max(2).optional(),
        format: z.enum(publicHistoryFormat).default('legacy'),
    })
    .superRefine((input, ctx) => {
        if (!input.metrics || input.format !== 'legacy') {
            return;
        }

        if (input.metrics.length === 1 && input.metrics[0] === 'bsr') {
            return;
        }

        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'legacy format only supports bsr metric',
            path: ['metrics'],
        });
    });

export const getProductHistory = publicApiProcedure
    .input(getProductHistoryInput)
    .mutation(async ({ input, ctx }) => {
        await consumeLicenseUsageOrThrow(ctx, 1);

        const requestedMetrics = normalizeRequestedMetrics(input.metrics);
        const metricEntries = await Promise.all(
            requestedMetrics.map(async metric => {
                const result = await getProductHistoryPoints({
                    marketplaceId: input.marketplaceId,
                    asin: input.asin,
                    metric: resolveKeepaMetric(metric),
                    startAt: input.startAt,
                    endAt: input.endAt,
                    limit: input.limit,
                });

                return [metric, result] as const;
            })
        );

        const resultsByMetric = Object.fromEntries(metricEntries) as Partial<Record<
            PublicHistoryMetric,
            (typeof metricEntries)[number][1]
        >>;
        const primaryMetric = resolvePrimaryMetric(requestedMetrics);
        const primaryResult = resultsByMetric[primaryMetric];
        if (!primaryResult) {
            const emptyLegacy = buildLegacyResponse({
                marketplaceId: input.marketplaceId,
                asin: input.asin,
                latestImportAt: null,
                categoryNames: {},
                points: [],
                collecting: false,
                syncTriggered: false,
            });

            if (input.format === 'legacy') {
                return emptyLegacy;
            }

            return {
                ...emptyLegacy,
                schemaVersion: 1 as const,
                status: 'empty' as const,
                series: {},
            };
        }
        const { collecting, syncTriggered } = resolveCollectionState({
            hasPoints: primaryResult.points.length > 0,
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            days: input.days,
        });

        const legacyResult = resultsByMetric.bsr;
        const legacyResponse = buildLegacyResponse({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            latestImportAt: legacyResult?.latestImportAt ?? null,
            categoryNames: legacyResult?.categoryNames ?? {},
            points: legacyResult?.points ?? [],
            collecting,
            syncTriggered,
        });
        if (input.format === 'legacy') {
            return legacyResponse;
        }

        const totalPointCount = metricEntries.reduce((total, [_, result]) => {
            return total + result.points.length;
        }, 0);

        return {
            ...legacyResponse,
            schemaVersion: 1 as const,
            status: collecting ? 'collecting' : totalPointCount > 0 ? 'ready' : 'empty',
            latestImportAt: resolveLatestImportAt(metricEntries.map(([_, result]) => result.latestImportAt)),
            series: {
                ...(resultsByMetric.bsr
                    ? {
                          bsr: {
                              unit: 'rank' as const,
                              category: resolveBsrCategory(resultsByMetric.bsr),
                              points: toHistoryPointTuples(resultsByMetric.bsr.points),
                          },
                      }
                    : {}),
                ...(resultsByMetric.price
                    ? {
                          price: {
                              unit: 'minorCurrency' as const,
                              currencyCode: 'USD' as const,
                              valueScale: 100 as const,
                              points: toHistoryPointTuples(resultsByMetric.price.points),
                          },
                      }
                    : {}),
            },
        };
    });

const normalizeRequestedMetrics = (metrics: PublicHistoryMetric[] | undefined) => {
    if (!metrics || metrics.length === 0) {
        return ['bsr'] as PublicHistoryMetric[];
    }

    return Array.from(new Set(metrics));
};

const resolvePrimaryMetric = (metrics: PublicHistoryMetric[]) => {
    return metrics.includes('bsr') ? 'bsr' : (metrics[0] ?? 'bsr');
};

const resolveKeepaMetric = (metric: PublicHistoryMetric): KeepaHistoryMetricKey => {
    if (metric === 'bsr') {
        return 'bsrMain';
    }

    return 'priceNew';
};

const resolveCollectionState = ({
    hasPoints,
    marketplaceId,
    asin,
    days,
}: {
    hasPoints: boolean;
    marketplaceId: string;
    asin: string;
    days: number;
}) => {
    if (hasPoints) {
        return {
            collecting: false,
            syncTriggered: false,
        };
    }

    const syncTriggerResult = triggerKeepaProductHistoryManualLoad({
        marketplaceId,
        asin,
        days,
    });

    return {
        collecting: true,
        syncTriggered: syncTriggerResult.triggered,
    };
};

const toHistoryPointTuples = (
    points: {
        observedAt: string;
        value: number | null;
        isMissing: boolean;
    }[]
) => {
    return points.map<HistoryPointTuple>(point => {
        if (point.isMissing) {
            return [point.observedAt, null, 1];
        }

        return [point.observedAt, point.value];
    });
};

const resolveBsrCategory = (result: {
    categoryNames: Record<string, string>;
    points: {
        categoryId: number;
        categoryName: string | null;
    }[];
}) => {
    for (let index = result.points.length - 1; index >= 0; index -= 1) {
        const point = result.points[index];
        if (point.categoryId <= 0) {
            continue;
        }

        return {
            id: point.categoryId,
            name: point.categoryName ?? result.categoryNames[String(point.categoryId)] ?? null,
        };
    }

    return null;
};

const resolveLatestImportAt = (latestImportValues: Array<string | null>) => {
    let latestDate: Date | null = null;

    for (const value of latestImportValues) {
        if (!value) {
            continue;
        }

        const candidateDate = new Date(value);
        if (!Number.isFinite(candidateDate.getTime())) {
            continue;
        }

        if (!latestDate || candidateDate > latestDate) {
            latestDate = candidateDate;
        }
    }

    return latestDate ? latestDate.toISOString() : null;
};

const buildLegacyResponse = ({
    marketplaceId,
    asin,
    latestImportAt,
    categoryNames,
    points,
    collecting,
    syncTriggered,
}: {
    marketplaceId: string;
    asin: string;
    latestImportAt: string | null;
    categoryNames: Record<string, string>;
    points: {
        categoryId: number;
        categoryName: string | null;
        observedAt: string;
        keepaMinutes: number;
        value: number | null;
        isMissing: boolean;
    }[];
    collecting: boolean;
    syncTriggered: boolean;
}) => {
    return {
        marketplaceId,
        asin,
        metric: 'bsrMain' as const,
        latestImportAt,
        categoryNames,
        points,
        collecting,
        syncTriggered,
    };
};
