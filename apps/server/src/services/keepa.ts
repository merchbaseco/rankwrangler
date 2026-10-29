import { KeepaCapacityDeferredError } from '@/services/providers/keepa/keepa-capacity-types';
import { KeepaDispatchDeferredError } from '@/services/keepa-dispatch-deferred';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { env } from '@/config/env';
import { db } from '@/db/index';
import {
    countProductHistoryPoints,
    readProductHistorySeries,
} from '@/db/product/product-history-series';
import { keepaCategories, productHistoryImports, products } from '@/db/schema';
import {
    keepaHistoryMetricColumns,
    type KeepaHistoryMetricKey,
} from '@/services/keepa-history-metrics';
import { ingestKeepaProduct } from '@/services/keepa-product-ingestion';
import {
    decodeKeepaHistorySeriesList,
    type KeepaHistorySeries,
    selectKeepaHistoryWindow,
} from '@/services/keepa-history-series';
import { KEEPA_FETCH_SUCCESS_GUARD_INTERVAL_MS } from '@/services/keepa-refresh-policy';
import { createKeepaProvider } from '@/services/providers/keepa/keepa-provider';
import {
    KeepaApiError,
    type KeepaCategoryResponse,
    type KeepaResponse,
} from '@/services/providers/keepa/keepa-provider-types';

type LoadKeepaProductHistoryParams = {
    marketplaceId: string;
    asin: string;
    days: number;
    operationId?: string;
    canDispatch?: () => Promise<boolean>;
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
const KEEPA_CATEGORY_BATCH_SIZE = 50;
const KEEPA_MIN_REFRESH_INTERVAL_MS = KEEPA_FETCH_SUCCESS_GUARD_INTERVAL_MS;

const keepaProductLoadsInFlight = new Map<string, Promise<KeepaImportSummary>>();
const keepaProvider = createKeepaProvider();

export const loadKeepaProductHistory = async (params: LoadKeepaProductHistoryParams) => {
    const key = `${params.marketplaceId}:${params.asin}:${params.canDispatch ? 'automatic' : 'explicit'}`;
    const existingLoad = keepaProductLoadsInFlight.get(key);
    if (existingLoad) {
        return await existingLoad;
    }

    const load = loadKeepaProductHistoryOnce(params).finally(() => {
        keepaProductLoadsInFlight.delete(key);
    });
    keepaProductLoadsInFlight.set(key, load);
    return await load;
};

const loadKeepaProductHistoryOnce = async ({
    marketplaceId,
    asin,
    days,
    operationId,
    canDispatch,
}: LoadKeepaProductHistoryParams): Promise<KeepaImportSummary> => {
    const keepaApiKey = env.RANKWRANGLER_KEEPA_API_KEY;
    if (!keepaApiKey) {
        throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'RANKWRANGLER_KEEPA_API_KEY is not configured',
        });
    }

    const productRow = await db
        .select({
            id: products.id,
            keepaFetchedAt: products.keepaFetchedAt,
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
    const recentImport = await getRecentSuccessfulKeepaImport(
        productId,
        productRow[0].keepaFetchedAt
    );
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
        marketplaceId,
        asin,
        history: 1,
        update: 1,
        days,
        stats: 365,
    };

    let keepaResponse: KeepaResponse;
    let cachedImportBeforeDispatch: KeepaImportRow | null = null;
    let eligibilityDeferred = false;

    try {
        const dispatchResult = await keepaProvider.getProduct({
            marketplaceId,
            asin,
            days,
            canDispatch: async () => {
                const keepaFetchedAt = await getProductKeepaFetchedAt(productId);
                cachedImportBeforeDispatch = await getRecentSuccessfulKeepaImport(
                    productId,
                    keepaFetchedAt
                );
                if (cachedImportBeforeDispatch) return false;
                eligibilityDeferred = canDispatch ? !(await canDispatch()) : false;
                return !eligibilityDeferred;
            },
        });
        if (dispatchResult.kind === 'skipped') {
            if (eligibilityDeferred) throw new KeepaDispatchDeferredError();
            if (!cachedImportBeforeDispatch) {
                throw new Error('Keepa dispatch was skipped without a fresh import');
            }
            return await buildKeepaImportSummaryFromCachedImport({
                productId,
                marketplaceId,
                asin,
                fallbackDays: days,
                importRow: cachedImportBeforeDispatch,
            });
        }

        keepaResponse = dispatchResult.payload;
    } catch (error) {
        if (
            error instanceof KeepaDispatchDeferredError ||
            error instanceof KeepaCapacityDeferredError
        )
            throw error;
        const errorDetails = extractKeepaErrorDetails(error);

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

    const keepaProduct = keepaResponse.products?.find(product => product.asin === asin);

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

    const fetchedAt = new Date();
    const ingestion = await ingestKeepaProduct({
        marketplaceId,
        asin,
        product: keepaProduct,
        fetchedAt,
        operationId,
        import: {
            requestParams,
            responsePayload: keepaResponse as unknown as Record<string, unknown>,
            tokensConsumed: keepaResponse.tokensConsumed ?? null,
            tokensLeft: keepaResponse.tokensLeft ?? null,
            refillInMs: keepaResponse.refillIn ?? null,
            refillRate: keepaResponse.refillRate ?? null,
        },
    });
    const parsedSeries = ingestion.normalized.historySeries;
    const pointCounts = getPointCountsByMetric(parsedSeries);
    await resolveCategoryNames({
        marketplaceId,
        categoryIds: parsedSeries.map(series => series.categoryId),
    });

    return {
        importId: ingestion.importId,
        marketplaceId,
        asin,
        days,
        pointsStored: Object.values(pointCounts).reduce((sum, value) => sum + value, 0),
        pointCounts,
        tokensConsumed: keepaResponse.tokensConsumed ?? null,
        tokensLeft: keepaResponse.tokensLeft ?? null,
        refillInMs: keepaResponse.refillIn ?? null,
        refillRate: keepaResponse.refillRate ?? null,
        status: 'success',
        cached: false,
        importedAt: ingestion.importedAt.toISOString(),
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
    // Price metrics are not category-scoped; writers store them only under the -1 sentinel.
    const isPriceMetric =
        metric === 'priceAmazon' || metric === 'priceNew' || metric === 'priceNewFba';
    const [series, latestImportAt] = await Promise.all([
        readProductHistorySeries({
            marketplaceId,
            asin,
            source: KEEPA_SOURCE,
            metric: keepaHistoryMetricColumns[metric],
            categoryId: categoryId ?? (isPriceMetric ? -1 : undefined),
        }),
        getLatestSuccessfulKeepaImportAt({ marketplaceId, asin }),
    ]);
    const points = selectKeepaHistoryWindow(decodeKeepaHistorySeriesList(series), {
        startAt,
        endAt,
        limit,
    });

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

export const hasRecentSuccessfulKeepaImportForAsin = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    const productRow = await db
        .select({
            id: products.id,
            keepaFetchedAt: products.keepaFetchedAt,
        })
        .from(products)
        .where(and(eq(products.marketplaceId, marketplaceId), eq(products.asin, asin)))
        .limit(1);

    if (productRow.length === 0) {
        return false;
    }

    return Boolean(
        await getRecentSuccessfulKeepaImport(productRow[0].id, productRow[0].keepaFetchedAt)
    );
};

export const resolveCategoryNames = async ({
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

    if (!env.RANKWRANGLER_KEEPA_API_KEY) {
        return categoryNames;
    }

    for (const categoryIdsChunk of chunkArray(missingCategoryIds, KEEPA_CATEGORY_BATCH_SIZE)) {
        try {
            const keepaCategoryResponse = await keepaProvider.getCategories({
                marketplaceId,
                categoryIds: categoryIdsChunk,
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
        } catch {
            continue;
        }
    }

    return categoryNames;
};

const getPointCountsByMetric = (seriesList: readonly KeepaHistorySeries[]) => {
    return seriesList.reduce<PointCountSummary>((counts, series) => {
        counts[series.metric] = (counts[series.metric] ?? 0) + series.keepaMinutes.length;
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
        new Set(categoryIds.filter(categoryId => Number.isFinite(categoryId) && categoryId > 0))
    )
        .map(categoryId => Math.trunc(categoryId))
        .sort((left, right) => left - right);
};

const chunkArray = <T>(values: T[], chunkSize: number): T[][] => {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += chunkSize) {
        chunks.push(values.slice(index, index + chunkSize));
    }
    return chunks;
};

export const extractKeepaErrorDetails = (error: unknown) => {
    if (error instanceof KeepaApiError) {
        return {
            code: error.code,
            message: error.message,
            payload: normalizeKeepaErrorPayload(error.payload),
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

const normalizeKeepaErrorPayload = (payload: unknown): Record<string, unknown> | null => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }

    return payload as Record<string, unknown>;
};

const getRecentSuccessfulKeepaImport = async (
    productId: string,
    keepaFetchedAt: Date | null
): Promise<KeepaImportRow | null> => {
    const recentThreshold = new Date(Date.now() - KEEPA_MIN_REFRESH_INTERVAL_MS);
    if (!keepaFetchedAt || keepaFetchedAt <= recentThreshold) {
        return null;
    }

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
                eq(productHistoryImports.status, 'success')
            )
        )
        .orderBy(desc(productHistoryImports.createdAt))
        .limit(1);

    return rows[0] ?? null;
};

const getProductKeepaFetchedAt = async (productId: string) => {
    const rows = await db
        .select({ keepaFetchedAt: products.keepaFetchedAt })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

    return rows[0]?.keepaFetchedAt ?? null;
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
        importRow.status === 'success'
            ? await countProductHistoryPoints(productId, KEEPA_SOURCE)
            : {};
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

const getDaysFromRequestParams = (requestParams: Record<string, unknown>, fallbackDays: number) => {
    const daysValue = requestParams.days;
    if (typeof daysValue === 'number' && Number.isFinite(daysValue) && daysValue > 0) {
        return Math.trunc(daysValue);
    }

    return fallbackDays;
};
