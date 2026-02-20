import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import Bottleneck from 'bottleneck';
import { env } from '@/config/env.js';
import { db } from '@/db/index.js';
import {
    keepaCategories,
    productHistoryImports,
    productHistoryPoints,
    products,
} from '@/db/schema.js';

export const keepaHistoryMetricKeys = [
    'bsrMain',
    'bsrCategory',
    'priceAmazon',
    'priceNew',
    'priceNewFba',
] as const;

export type KeepaHistoryMetricKey = (typeof keepaHistoryMetricKeys)[number];

type LoadKeepaProductHistoryParams = {
    marketplaceId: string;
    asin: string;
    days: number;
    queuePriority?: 'manual' | 'background';
};

type GetProductHistoryPointsParams = {
    marketplaceId: string;
    asin: string;
    metric: KeepaHistoryMetricKey;
    categoryId?: number;
    startAt?: Date;
    endAt?: Date;
    limit: number;
};

type KeepaResponse = {
    products?: KeepaProduct[];
    tokensConsumed?: number;
    tokensLeft?: number;
    refillIn?: number;
    refillRate?: number;
    error?: {
        code?: string;
        message?: string;
    };
};

type KeepaProduct = {
    asin?: string;
    csv?: number[][];
    salesRanks?: Record<string, number[]>;
    salesRankReference?: number;
};

type KeepaCategoryResponse = {
    categories?: Record<string, KeepaCategory>;
    tokensConsumed?: number;
    tokensLeft?: number;
    refillIn?: number;
    refillRate?: number;
    error?: {
        code?: string;
        message?: string;
    };
};

type KeepaCategory = {
    catId?: number;
    name?: string;
    contextFreeName?: string;
};

type KeepaTokenResponse = {
    tokensConsumed?: number;
    tokensLeft?: number;
    refillIn?: number;
    refillRate?: number;
    error?: {
        code?: string;
        type?: string;
        message?: string;
    };
};

type ParsedPoint = {
    metric: string;
    categoryId: number;
    observedAt: Date;
    keepaMinutes: number;
    valueInt: number | null;
    isMissing: boolean;
};

type PointCountSummary = Record<string, number>;

export type KeepaImportSummary = {
    importId: string;
    marketplaceId: string;
    asin: string;
    days: number;
    pointsStored: number;
    pointCounts: PointCountSummary;
    tokensConsumed: number | null;
    tokensLeft: number | null;
    refillInMs: number | null;
    refillRate: number | null;
    status: 'success' | 'error';
    cached: boolean;
    importedAt: string;
    errorCode: string | null;
    errorMessage: string | null;
    responsePayload: Record<string, unknown> | null;
};

export type KeepaRuntimeTokenState = {
    tokensConsumed: number | null;
    tokensLeft: number | null;
    refillInMs: number | null;
    refillRate: number | null;
    updatedAt: string | null;
};

type KeepaImportRow = {
    id: string;
    status: string;
    requestParams: Record<string, unknown>;
    responsePayload: Record<string, unknown> | null;
    tokensConsumed: number | null;
    tokensLeft: number | null;
    refillInMs: number | null;
    refillRate: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: Date;
};

type CategoryNamesById = Record<string, string>;

const KEEPA_SOURCE = 'keepa';
const KEEPA_UPDATE_HOURS = 1;
const KEEPA_MINUTE_EPOCH_OFFSET = 21564000;
const KEEPA_CATEGORY_BATCH_SIZE = 50;
const KEEPA_MIN_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const KEEPA_TOKEN_STATE_STALE_MS = 60 * 1000;

const keepaRateLimiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 3000,
    reservoir: 20,
    reservoirRefreshAmount: 20,
    reservoirRefreshInterval: 60 * 1000,
});

const historyMetricMap: Record<KeepaHistoryMetricKey, string> = {
    bsrMain: 'bsr_main',
    bsrCategory: 'bsr_category',
    priceAmazon: 'price_amazon',
    priceNew: 'price_new',
    priceNewFba: 'price_new_fba',
};

const keepaTokenState: {
    tokensConsumed: number | null;
    tokensLeft: number | null;
    refillInMs: number | null;
    refillRate: number | null;
    updatedAt: Date | null;
} = {
    tokensConsumed: null,
    tokensLeft: null,
    refillInMs: null,
    refillRate: null,
    updatedAt: null,
};

let keepaTokenRefreshInFlight: Promise<KeepaRuntimeTokenState> | null = null;

export const getKeepaRuntimeTokenState = (): KeepaRuntimeTokenState => {
    const estimatedTokensLeft = estimateTokensLeft({
        tokensLeft: keepaTokenState.tokensLeft,
        refillInMs: keepaTokenState.refillInMs,
        refillRate: keepaTokenState.refillRate,
        updatedAt: keepaTokenState.updatedAt,
    });

    return {
        tokensConsumed: keepaTokenState.tokensConsumed,
        tokensLeft: estimatedTokensLeft,
        refillInMs: keepaTokenState.refillInMs,
        refillRate: keepaTokenState.refillRate,
        updatedAt: keepaTokenState.updatedAt ? keepaTokenState.updatedAt.toISOString() : null,
    };
};

export const ensureFreshKeepaTokenState = async ({
    maxAgeMs = KEEPA_TOKEN_STATE_STALE_MS,
}: {
    maxAgeMs?: number;
} = {}): Promise<KeepaRuntimeTokenState> => {
    if (!env.KEEPA_API_KEY) {
        return getKeepaRuntimeTokenState();
    }

    if (keepaTokenRefreshInFlight) {
        return keepaTokenRefreshInFlight;
    }

    if (!isKeepaTokenStateStale(maxAgeMs)) {
        return getKeepaRuntimeTokenState();
    }

    keepaTokenRefreshInFlight = refreshKeepaTokenStateFromApi(env.KEEPA_API_KEY);

    try {
        return await keepaTokenRefreshInFlight;
    } finally {
        keepaTokenRefreshInFlight = null;
    }
};

export const loadKeepaProductHistory = async ({
    marketplaceId,
    asin,
    days,
    queuePriority = 'background',
}: LoadKeepaProductHistoryParams): Promise<KeepaImportSummary> => {
    const keepaApiKey = env.KEEPA_API_KEY;
    if (!keepaApiKey) {
        throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'KEEPA_API_KEY is not configured',
        });
    }

    const keepaDomainId = getKeepaDomainId(marketplaceId);
    if (!keepaDomainId) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Marketplace ${marketplaceId} is not supported by Keepa integration`,
        });
    }

    const productRow = await db
        .select({
            id: products.id,
        })
        .from(products)
        .where(and(eq(products.marketplaceId, marketplaceId), eq(products.asin, asin)))
        .limit(1);

    if (productRow.length === 0) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Product not found in cache. Fetch product info first, then load history.',
        });
    }

    const productId = productRow[0].id;
    const recentImport = await getRecentSuccessfulKeepaImport(productId);
    if (recentImport) {
        return buildKeepaImportSummaryFromCachedImport({
            productId,
            marketplaceId,
            asin,
            fallbackDays: days,
            importRow: recentImport,
        });
    }

    const requestParams = {
        domain: keepaDomainId,
        asin,
        history: 1,
        update: KEEPA_UPDATE_HOURS,
        days,
    };

    let keepaResponse: KeepaResponse;

    try {
        keepaResponse = await keepaRateLimiter.schedule(
            { priority: getKeepaRateLimiterPriority(queuePriority) },
            () =>
                fetchKeepaProduct({
                    apiKey: keepaApiKey,
                    domainId: keepaDomainId,
                    asin,
                    days,
                })
        );
        updateKeepaTokenState({
            tokensConsumed: keepaResponse.tokensConsumed ?? null,
            tokensLeft: keepaResponse.tokensLeft ?? null,
            refillInMs: keepaResponse.refillIn ?? null,
            refillRate: keepaResponse.refillRate ?? null,
        });
    } catch (error) {
        const errorDetails = extractKeepaErrorDetails(error);
        updateKeepaTokenState({
            tokensConsumed: errorDetails.tokensConsumed,
            tokensLeft: errorDetails.tokensLeft,
            refillInMs: errorDetails.refillIn,
            refillRate: errorDetails.refillRate,
        });

        await db.insert(productHistoryImports).values({
            productId,
            marketplaceId,
            asin,
            source: KEEPA_SOURCE,
            status: 'error',
            requestParams,
            responsePayload: errorDetails.payload,
            tokensConsumed: errorDetails.tokensConsumed,
            tokensLeft: errorDetails.tokensLeft,
            refillInMs: errorDetails.refillIn,
            refillRate: errorDetails.refillRate,
            errorCode: errorDetails.code,
            errorMessage: errorDetails.message,
        });

        throw new TRPCError({
            code: 'BAD_GATEWAY',
            message: `Keepa request failed: ${errorDetails.message}`,
        });
    }

    const keepaProduct =
        keepaResponse.products?.find(product => product.asin === asin) ?? keepaResponse.products?.[0];

    if (!keepaProduct) {
        const errorCode = keepaResponse.error?.code ?? 'NO_PRODUCT';
        const errorMessage = keepaResponse.error?.message ?? 'Keepa returned no product payload';

        await db.insert(productHistoryImports).values({
            productId,
            marketplaceId,
            asin,
            source: KEEPA_SOURCE,
            status: 'error',
            requestParams,
            responsePayload: keepaResponse,
            tokensConsumed: keepaResponse.tokensConsumed ?? null,
            tokensLeft: keepaResponse.tokensLeft ?? null,
            refillInMs: keepaResponse.refillIn ?? null,
            refillRate: keepaResponse.refillRate ?? null,
            errorCode,
            errorMessage,
        });

        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Keepa returned no product history for this ASIN',
        });
    }

    const parsedPoints = parseKeepaHistoryPoints(keepaProduct);
    const pointCounts = getPointCountsByMetric(parsedPoints);
    await resolveCategoryNames({
        marketplaceId,
        categoryIds: parsedPoints.map(point => point.categoryId),
    });

    const [insertedImport] = await db
        .insert(productHistoryImports)
        .values({
            productId,
            marketplaceId,
            asin,
            source: KEEPA_SOURCE,
            status: 'success',
            requestParams,
            responsePayload: keepaResponse,
            tokensConsumed: keepaResponse.tokensConsumed ?? null,
            tokensLeft: keepaResponse.tokensLeft ?? null,
            refillInMs: keepaResponse.refillIn ?? null,
            refillRate: keepaResponse.refillRate ?? null,
            errorCode: null,
            errorMessage: null,
        })
        .returning({
            id: productHistoryImports.id,
            createdAt: productHistoryImports.createdAt,
        });

    for (let index = 0; index < parsedPoints.length; index += 500) {
        const pointsChunk = parsedPoints.slice(index, index + 500);

        await db
            .insert(productHistoryPoints)
            .values(
                pointsChunk.map(point => ({
                    productId,
                    marketplaceId,
                    asin,
                    source: KEEPA_SOURCE,
                    metric: point.metric,
                    categoryId: point.categoryId,
                    observedAt: point.observedAt,
                    keepaMinutes: point.keepaMinutes,
                    valueInt: point.valueInt,
                    isMissing: point.isMissing,
                }))
            )
            .onConflictDoUpdate({
                target: [
                    productHistoryPoints.productId,
                    productHistoryPoints.source,
                    productHistoryPoints.metric,
                    productHistoryPoints.categoryId,
                    productHistoryPoints.keepaMinutes,
                ],
                set: {
                    observedAt: sql`excluded.observed_at`,
                    valueInt: sql`excluded.value_int`,
                    isMissing: sql`excluded.is_missing`,
                },
            });
    }

    await db
        .delete(productHistoryImports)
        .where(
            and(
                eq(productHistoryImports.productId, productId),
                eq(productHistoryImports.source, KEEPA_SOURCE),
                eq(productHistoryImports.status, 'success'),
                ne(productHistoryImports.id, insertedImport.id)
            )
        );

    return {
        importId: insertedImport.id,
        marketplaceId,
        asin,
        days,
        pointsStored: parsedPoints.length,
        pointCounts,
        tokensConsumed: keepaResponse.tokensConsumed ?? null,
        tokensLeft: keepaResponse.tokensLeft ?? null,
        refillInMs: keepaResponse.refillIn ?? null,
        refillRate: keepaResponse.refillRate ?? null,
        status: 'success',
        cached: false,
        importedAt: insertedImport.createdAt.toISOString(),
        errorCode: null,
        errorMessage: null,
        responsePayload: keepaResponse,
    };
};

export const getProductHistoryPoints = async ({
    marketplaceId,
    asin,
    metric,
    categoryId,
    startAt,
    endAt,
    limit,
}: GetProductHistoryPointsParams) => {
    const dbMetric = historyMetricMap[metric];
    const whereConditions = [
        eq(productHistoryPoints.marketplaceId, marketplaceId),
        eq(productHistoryPoints.asin, asin),
        eq(productHistoryPoints.source, KEEPA_SOURCE),
        eq(productHistoryPoints.metric, dbMetric),
    ];

    if (metric === 'priceAmazon' || metric === 'priceNew' || metric === 'priceNewFba') {
        whereConditions.push(eq(productHistoryPoints.categoryId, -1));
    }

    if (typeof categoryId === 'number') {
        whereConditions.push(eq(productHistoryPoints.categoryId, categoryId));
    }

    if (startAt) {
        whereConditions.push(gte(productHistoryPoints.observedAt, startAt));
    }

    if (endAt) {
        whereConditions.push(lte(productHistoryPoints.observedAt, endAt));
    }

    const [points, latestImportAt] = await Promise.all([
        db
            .select({
                categoryId: productHistoryPoints.categoryId,
                observedAt: productHistoryPoints.observedAt,
                keepaMinutes: productHistoryPoints.keepaMinutes,
                valueInt: productHistoryPoints.valueInt,
                isMissing: productHistoryPoints.isMissing,
            })
            .from(productHistoryPoints)
            .where(and(...whereConditions))
            .orderBy(asc(productHistoryPoints.observedAt))
            .limit(limit),
        getLatestSuccessfulKeepaImportAt({ marketplaceId, asin }),
    ]);

    const categoryNames = await resolveCategoryNames({
        marketplaceId,
        categoryIds: points.map(point => point.categoryId),
    });

    return {
        marketplaceId,
        asin,
        metric,
        latestImportAt: latestImportAt ? latestImportAt.toISOString() : null,
        categoryNames,
        points: points.map(point => ({
            categoryId: point.categoryId,
            categoryName: categoryNames[String(point.categoryId)] ?? null,
            observedAt: point.observedAt.toISOString(),
            keepaMinutes: point.keepaMinutes,
            value: point.valueInt,
            isMissing: point.isMissing,
        })),
    };
};

const fetchKeepaProduct = async ({
    apiKey,
    domainId,
    asin,
    days,
}: {
    apiKey: string;
    domainId: number;
    asin: string;
    days: number;
}) => {
    const params = new URLSearchParams({
        key: apiKey,
        domain: String(domainId),
        asin,
        history: '1',
        update: String(KEEPA_UPDATE_HOURS),
        days: String(days),
    });

    const response = await fetch(`https://api.keepa.com/product?${params.toString()}`);
    const payload = (await response.json()) as KeepaResponse;

    if (!response.ok) {
        throw new KeepaApiError(
            payload.error?.code ?? String(response.status),
            payload.error?.message ?? `HTTP ${response.status}`,
            payload,
            payload.tokensConsumed,
            payload.tokensLeft,
            payload.refillIn,
            payload.refillRate
        );
    }

    return payload;
};

const fetchKeepaTokenStatus = async ({ apiKey }: { apiKey: string }) => {
    const params = new URLSearchParams({
        key: apiKey,
    });

    const response = await fetch(`https://api.keepa.com/token?${params.toString()}`);
    const rawPayload = (await response.json()) as KeepaTokenResponse | number;
    const payload = normalizeKeepaTokenResponse(rawPayload);

    if (!response.ok || payload.error?.message) {
        throw new KeepaApiError(
            payload.error?.code ?? payload.error?.type ?? String(response.status),
            payload.error?.message ?? `HTTP ${response.status}`,
            payload,
            payload.tokensConsumed,
            payload.tokensLeft,
            payload.refillIn,
            payload.refillRate
        );
    }

    return payload;
};

const fetchKeepaCategories = async ({
    apiKey,
    domainId,
    categoryIds,
}: {
    apiKey: string;
    domainId: number;
    categoryIds: number[];
}) => {
    const params = new URLSearchParams({
        key: apiKey,
        domain: String(domainId),
        category: categoryIds.join(','),
    });

    const response = await fetch(`https://api.keepa.com/category?${params.toString()}`);
    const payload = (await response.json()) as KeepaCategoryResponse;

    if (!response.ok || payload.error?.message) {
        throw new KeepaApiError(
            payload.error?.code ?? String(response.status),
            payload.error?.message ?? `HTTP ${response.status}`,
            payload,
            payload.tokensConsumed,
            payload.tokensLeft,
            payload.refillIn,
            payload.refillRate
        );
    }

    return payload;
};

const resolveCategoryNames = async ({
    marketplaceId,
    categoryIds,
}: {
    marketplaceId: string;
    categoryIds: number[];
}): Promise<CategoryNamesById> => {
    const normalizedCategoryIds = normalizeCategoryIds(categoryIds);
    if (normalizedCategoryIds.length === 0) {
        return {};
    }

    const cachedRows = await db
        .select({
            categoryId: keepaCategories.categoryId,
            name: keepaCategories.name,
        })
        .from(keepaCategories)
        .where(
            and(
                eq(keepaCategories.marketplaceId, marketplaceId),
                inArray(keepaCategories.categoryId, normalizedCategoryIds)
            )
        );

    const categoryNames: CategoryNamesById = {};
    for (const row of cachedRows) {
        categoryNames[String(row.categoryId)] = row.name;
    }

    const missingCategoryIds = normalizedCategoryIds.filter(
        categoryId => !categoryNames[String(categoryId)]
    );
    if (missingCategoryIds.length === 0) {
        return categoryNames;
    }

    const keepaApiKey = env.KEEPA_API_KEY;
    const keepaDomainId = getKeepaDomainId(marketplaceId);
    if (!keepaApiKey || !keepaDomainId) {
        return categoryNames;
    }

    for (const categoryIdsChunk of chunkArray(missingCategoryIds, KEEPA_CATEGORY_BATCH_SIZE)) {
        try {
            const keepaCategoryResponse = await keepaRateLimiter.schedule(() =>
                fetchKeepaCategories({
                    apiKey: keepaApiKey,
                    domainId: keepaDomainId,
                    categoryIds: categoryIdsChunk,
                })
            );
            updateKeepaTokenState({
                tokensConsumed: keepaCategoryResponse.tokensConsumed ?? null,
                tokensLeft: keepaCategoryResponse.tokensLeft ?? null,
                refillInMs: keepaCategoryResponse.refillIn ?? null,
                refillRate: keepaCategoryResponse.refillRate ?? null,
            });

            const resolvedCategoryNames = parseKeepaCategoryNames(keepaCategoryResponse);
            const rowsToUpsert = Object.entries(resolvedCategoryNames).map(
                ([categoryId, name]) => ({
                    marketplaceId,
                    categoryId: Number(categoryId),
                    name,
                })
            );

            if (rowsToUpsert.length > 0) {
                await db
                    .insert(keepaCategories)
                    .values(rowsToUpsert)
                    .onConflictDoUpdate({
                        target: [keepaCategories.marketplaceId, keepaCategories.categoryId],
                        set: {
                            name: sql`excluded.name`,
                            updatedAt: sql`now()`,
                        },
                    });
            }

            for (const [categoryId, name] of Object.entries(resolvedCategoryNames)) {
                categoryNames[categoryId] = name;
            }
        } catch (error) {
            const errorDetails = extractKeepaErrorDetails(error);
            updateKeepaTokenState({
                tokensConsumed: errorDetails.tokensConsumed,
                tokensLeft: errorDetails.tokensLeft,
                refillInMs: errorDetails.refillIn,
                refillRate: errorDetails.refillRate,
            });
            continue;
        }
    }

    return categoryNames;
};

const parseKeepaHistoryPoints = (product: KeepaProduct) => {
    const points: ParsedPoint[] = [];
    const csv = product.csv ?? [];
    const mainCategoryId =
        typeof product.salesRankReference === 'number' && product.salesRankReference > 0
            ? product.salesRankReference
            : -1;

    points.push(...parseKeepaPairSeries(csv[3], historyMetricMap.bsrMain, mainCategoryId));
    points.push(...parseKeepaPairSeries(csv[0], historyMetricMap.priceAmazon, -1));
    points.push(...parseKeepaPairSeries(csv[1], historyMetricMap.priceNew, -1));
    points.push(...parseKeepaPairSeries(csv[10], historyMetricMap.priceNewFba, -1));

    if (product.salesRanks) {
        for (const [categoryIdKey, series] of Object.entries(product.salesRanks)) {
            const categoryId = Number(categoryIdKey);
            if (!Number.isFinite(categoryId)) {
                continue;
            }
            points.push(...parseKeepaPairSeries(series, historyMetricMap.bsrCategory, categoryId));
        }
    }

    const deduped = new Map<string, ParsedPoint>();
    for (const point of points) {
        const pointKey = `${point.metric}:${point.categoryId}:${point.keepaMinutes}`;
        deduped.set(pointKey, point);
    }

    return Array.from(deduped.values()).sort((a, b) => a.keepaMinutes - b.keepaMinutes);
};

const parseKeepaPairSeries = (series: number[] | undefined, metric: string, categoryId: number) => {
    if (!series || series.length < 2) {
        return [] as ParsedPoint[];
    }

    const points: ParsedPoint[] = [];

    for (let index = 0; index + 1 < series.length; index += 2) {
        const keepaMinutes = series[index];
        const value = series[index + 1];

        if (!Number.isFinite(keepaMinutes)) {
            continue;
        }

        const observedAt = keepaMinuteToDate(keepaMinutes);
        const isMissing = value < 0;

        points.push({
            metric,
            categoryId,
            observedAt,
            keepaMinutes,
            valueInt: isMissing ? null : value,
            isMissing,
        });
    }

    return points;
};

const keepaMinuteToDate = (keepaMinutes: number) => {
    const unixMinutes = keepaMinutes + KEEPA_MINUTE_EPOCH_OFFSET;
    return new Date(unixMinutes * 60 * 1000);
};

const getKeepaDomainId = (marketplaceId: string): number | null => {
    const mapping: Record<string, number> = {
        ATVPDKIKX0DER: 1,
        A1F83G8C2ARO7P: 2,
        A1PA6795UKMFR9: 3,
        A13V1IB3VIYZZH: 4,
        A1VC38T7YXB528: 5,
        A2EUQ1WTGCTBG2: 8,
        A1RKKUPIHCS9HS: 9,
        A21TJRUUN4KGV: 10,
        A1AM78C64UM0Y8: 11,
        A2Q3Y263D00KWC: 12,
    };

    return mapping[marketplaceId] ?? null;
};

const getPointCountsByMetric = (points: ParsedPoint[]) => {
    return points.reduce<PointCountSummary>((counts, point) => {
        counts[point.metric] = (counts[point.metric] ?? 0) + 1;
        return counts;
    }, {});
};

const parseKeepaCategoryNames = (payload: KeepaCategoryResponse): CategoryNamesById => {
    const categories = payload.categories ?? {};
    const categoryNames: CategoryNamesById = {};

    for (const [categoryIdKey, category] of Object.entries(categories)) {
        const categoryId = Number(categoryIdKey);
        if (!Number.isFinite(categoryId) || categoryId <= 0) {
            continue;
        }

        const categoryName = category.contextFreeName?.trim() || category.name?.trim();
        if (!categoryName) {
            continue;
        }

        categoryNames[String(categoryId)] = categoryName;
    }

    return categoryNames;
};

const normalizeCategoryIds = (categoryIds: number[]) => {
    return Array.from(
        new Set(
            categoryIds.filter(categoryId => Number.isFinite(categoryId) && categoryId > 0)
        )
    )
        .map(categoryId => Math.trunc(categoryId))
        .sort((left, right) => left - right);
};

const chunkArray = <T,>(values: T[], chunkSize: number): T[][] => {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += chunkSize) {
        chunks.push(values.slice(index, index + chunkSize));
    }
    return chunks;
};

const extractKeepaErrorDetails = (error: unknown) => {
    if (error instanceof KeepaApiError) {
        return {
            code: error.code,
            message: error.message,
            payload: error.payload,
            tokensConsumed: error.tokensConsumed ?? null,
            tokensLeft: error.tokensLeft ?? null,
            refillIn: error.refillIn ?? null,
            refillRate: error.refillRate ?? null,
        };
    }

    if (error instanceof Error) {
        return {
            code: 'UNKNOWN',
            message: error.message,
            payload: null,
            tokensConsumed: null,
            tokensLeft: null,
            refillIn: null,
            refillRate: null,
        };
    }

    return {
        code: 'UNKNOWN',
        message: 'Unknown Keepa error',
        payload: null,
        tokensConsumed: null,
        tokensLeft: null,
        refillIn: null,
        refillRate: null,
    };
};

const getRecentSuccessfulKeepaImport = async (
    productId: string
): Promise<KeepaImportRow | null> => {
    const recentThreshold = new Date(Date.now() - KEEPA_MIN_REFRESH_INTERVAL_MS);
    const rows = await db
        .select({
            id: productHistoryImports.id,
            status: productHistoryImports.status,
            requestParams: productHistoryImports.requestParams,
            responsePayload: productHistoryImports.responsePayload,
            tokensConsumed: productHistoryImports.tokensConsumed,
            tokensLeft: productHistoryImports.tokensLeft,
            refillInMs: productHistoryImports.refillInMs,
            refillRate: productHistoryImports.refillRate,
            errorCode: productHistoryImports.errorCode,
            errorMessage: productHistoryImports.errorMessage,
            createdAt: productHistoryImports.createdAt,
        })
        .from(productHistoryImports)
        .where(
            and(
                eq(productHistoryImports.productId, productId),
                eq(productHistoryImports.source, KEEPA_SOURCE),
                eq(productHistoryImports.status, 'success'),
                gte(productHistoryImports.createdAt, recentThreshold)
            )
        )
        .orderBy(desc(productHistoryImports.createdAt))
        .limit(1);

    return rows[0] ?? null;
};

const getLatestSuccessfulKeepaImportAt = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    const rows = await db
        .select({
            createdAt: productHistoryImports.createdAt,
        })
        .from(productHistoryImports)
        .where(
            and(
                eq(productHistoryImports.marketplaceId, marketplaceId),
                eq(productHistoryImports.asin, asin),
                eq(productHistoryImports.source, KEEPA_SOURCE),
                eq(productHistoryImports.status, 'success')
            )
        )
        .orderBy(desc(productHistoryImports.createdAt))
        .limit(1);

    return rows[0]?.createdAt ?? null;
};

const buildKeepaImportSummaryFromCachedImport = async ({
    productId,
    marketplaceId,
    asin,
    fallbackDays,
    importRow,
}: {
    productId: string;
    marketplaceId: string;
    asin: string;
    fallbackDays: number;
    importRow: KeepaImportRow;
}): Promise<KeepaImportSummary> => {
    const pointCounts =
        importRow.status === 'success' ? await getStoredPointCountsByMetric(productId) : {};
    const pointsStored = Object.values(pointCounts).reduce((sum, value) => sum + value, 0);

    return {
        importId: importRow.id,
        marketplaceId,
        asin,
        days: getDaysFromRequestParams(importRow.requestParams, fallbackDays),
        pointsStored,
        pointCounts,
        tokensConsumed: importRow.tokensConsumed,
        tokensLeft: importRow.tokensLeft,
        refillInMs: importRow.refillInMs,
        refillRate: importRow.refillRate,
        status: importRow.status === 'success' ? 'success' : 'error',
        cached: true,
        importedAt: importRow.createdAt.toISOString(),
        errorCode: importRow.errorCode,
        errorMessage: importRow.errorMessage,
        responsePayload: importRow.responsePayload,
    };
};

const getStoredPointCountsByMetric = async (productId: string): Promise<PointCountSummary> => {
    const rows = await db
        .select({
            metric: productHistoryPoints.metric,
            count: sql<number>`count(*)::int`,
        })
        .from(productHistoryPoints)
        .where(
            and(
                eq(productHistoryPoints.productId, productId),
                eq(productHistoryPoints.source, KEEPA_SOURCE)
            )
        )
        .groupBy(productHistoryPoints.metric);

    const pointCounts: PointCountSummary = {};
    for (const row of rows) {
        pointCounts[row.metric] = row.count;
    }

    return pointCounts;
};

const getDaysFromRequestParams = (requestParams: Record<string, unknown>, fallbackDays: number) => {
    const daysValue = requestParams.days;
    if (typeof daysValue === 'number' && Number.isFinite(daysValue) && daysValue > 0) {
        return Math.trunc(daysValue);
    }

    return fallbackDays;
};

const updateKeepaTokenState = ({
    tokensConsumed,
    tokensLeft,
    refillInMs,
    refillRate,
}: {
    tokensConsumed: number | null;
    tokensLeft: number | null;
    refillInMs: number | null;
    refillRate: number | null;
}) => {
    keepaTokenState.tokensConsumed = tokensConsumed;
    keepaTokenState.tokensLeft = tokensLeft;
    keepaTokenState.refillInMs = refillInMs;
    keepaTokenState.refillRate = refillRate;
    keepaTokenState.updatedAt = new Date();
};

const estimateTokensLeft = ({
    tokensLeft,
    refillInMs,
    refillRate,
    updatedAt,
}: {
    tokensLeft: number | null;
    refillInMs: number | null;
    refillRate: number | null;
    updatedAt: Date | null;
}) => {
    if (
        typeof tokensLeft !== 'number' ||
        typeof refillRate !== 'number' ||
        refillRate <= 0 ||
        !updatedAt
    ) {
        return tokensLeft;
    }

    const elapsedMs = Date.now() - updatedAt.getTime();
    if (elapsedMs <= 0) {
        return tokensLeft;
    }

    const refillDelayMs =
        typeof refillInMs === 'number' && refillInMs > 0 ? refillInMs : 0;
    if (elapsedMs <= refillDelayMs) {
        return tokensLeft;
    }

    const regeneratedWindows =
        Math.floor((elapsedMs - refillDelayMs) / (60 * 1000)) + 1;
    const regeneratedTokens = regeneratedWindows * refillRate;

    return tokensLeft + regeneratedTokens;
};

const getKeepaRateLimiterPriority = (queuePriority: 'manual' | 'background') => {
    return queuePriority === 'manual' ? 1 : 5;
};

const refreshKeepaTokenStateFromApi = async (apiKey: string): Promise<KeepaRuntimeTokenState> => {
    try {
        const keepaTokenResponse = await keepaRateLimiter.schedule({ priority: 0 }, () =>
            fetchKeepaTokenStatus({ apiKey })
        );
        updateKeepaTokenState({
            tokensConsumed: keepaTokenResponse.tokensConsumed ?? null,
            tokensLeft: keepaTokenResponse.tokensLeft ?? null,
            refillInMs: keepaTokenResponse.refillIn ?? null,
            refillRate: keepaTokenResponse.refillRate ?? null,
        });
    } catch (error) {
        const errorDetails = extractKeepaErrorDetails(error);
        if (hasKeepaTokenMetadata(errorDetails)) {
            updateKeepaTokenState({
                tokensConsumed: errorDetails.tokensConsumed,
                tokensLeft: errorDetails.tokensLeft,
                refillInMs: errorDetails.refillIn,
                refillRate: errorDetails.refillRate,
            });
        }
    }

    return getKeepaRuntimeTokenState();
};

const normalizeKeepaTokenResponse = (payload: KeepaTokenResponse | number): KeepaTokenResponse => {
    if (typeof payload === 'number') {
        return {
            tokensLeft: payload,
        };
    }

    if (payload && typeof payload === 'object') {
        return payload;
    }

    return {};
};

const isKeepaTokenStateStale = (maxAgeMs: number) => {
    if (!keepaTokenState.updatedAt) {
        return true;
    }

    return Date.now() - keepaTokenState.updatedAt.getTime() >= maxAgeMs;
};

const hasKeepaTokenMetadata = ({
    tokensConsumed,
    tokensLeft,
    refillIn,
    refillRate,
}: {
    tokensConsumed: number | null;
    tokensLeft: number | null;
    refillIn: number | null;
    refillRate: number | null;
}) => {
    return (
        typeof tokensConsumed === 'number' ||
        typeof tokensLeft === 'number' ||
        typeof refillIn === 'number' ||
        typeof refillRate === 'number'
    );
};

class KeepaApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public payload: unknown,
        public tokensConsumed?: number,
        public tokensLeft?: number,
        public refillIn?: number,
        public refillRate?: number
    ) {
        super(message);
        this.name = 'KeepaApiError';
    }
}
