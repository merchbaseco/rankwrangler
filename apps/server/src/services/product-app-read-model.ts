import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { eventLogs, keepaHistoryRefreshQueue, productHistoryImports, products } from '@/db/schema';
import { getProductDetails, type ProductRetrieval } from './product-retrieval';

export interface ProviderProvenance {
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    sourceObservedAt: string | null;
    suppliedDataCategories: string[];
    latestError: string | null;
    retryAt: string | null;
}

export interface ProductProvenance {
    spApi: ProviderProvenance;
    keepa: ProviderProvenance;
}

type ProductRow = typeof products.$inferSelect;

interface ProductProvenanceSource {
    product: ProductRow | null;
    spApi: {
        latestAttemptAt: Date | null;
        latestSuccessAt: Date | null;
        latestError: string | null;
    };
    keepa: {
        latestAttemptAt: Date | null;
        latestSuccessAt: Date | null;
        latestError: string | null;
        retryAt: Date | null;
    };
}

export const getProductAppReadModel = async (
    input: {
        marketplaceId: string;
        asin: string;
        includeProvenance?: boolean;
        refresh?: boolean;
        signal?: AbortSignal;
    },
    deps: {
        getProductDetails?: typeof getProductDetails;
        getProductProvenance?: typeof getProductProvenance;
    } = {}
): Promise<ProductRetrieval & { provenance: ProductProvenance | null }> => {
    const getDetails = deps.getProductDetails ?? getProductDetails;
    const getProvenance = deps.getProductProvenance ?? getProductProvenance;
    const { includeProvenance = false, ...productInput } = input;
    const result = await getDetails(productInput);
    const provenance = includeProvenance
        ? await getProvenance({
              marketplaceId: input.marketplaceId,
              asin: input.asin,
          })
        : null;
    return { ...result, provenance };
};

export const getProductProvenance = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}): Promise<ProductProvenance> => {
    const identity = { marketplaceId, asin: asin.trim().toUpperCase() };
    const [
        productRows,
        spApiAttemptRows,
        spApiSuccessRows,
        spApiErrorRows,
        keepaAttemptRows,
        keepaSuccessRows,
        keepaErrorRows,
        queueRows,
    ] = await Promise.all([
        db
            .select()
            .from(products)
            .where(
                and(
                    eq(products.marketplaceId, identity.marketplaceId),
                    eq(products.asin, identity.asin)
                )
            )
            .limit(1),
        getLatestProductEvent(identity, undefined),
        getLatestProductEvent(identity, 'success'),
        getLatestProductEvent(identity, 'failed'),
        db
            .select({ createdAt: productHistoryImports.createdAt })
            .from(productHistoryImports)
            .where(
                and(
                    eq(productHistoryImports.marketplaceId, identity.marketplaceId),
                    eq(productHistoryImports.asin, identity.asin),
                    eq(productHistoryImports.source, 'keepa')
                )
            )
            .orderBy(desc(productHistoryImports.createdAt))
            .limit(1),
        db
            .select({ createdAt: productHistoryImports.createdAt })
            .from(productHistoryImports)
            .where(
                and(
                    eq(productHistoryImports.marketplaceId, identity.marketplaceId),
                    eq(productHistoryImports.asin, identity.asin),
                    eq(productHistoryImports.source, 'keepa'),
                    eq(productHistoryImports.status, 'success')
                )
            )
            .orderBy(desc(productHistoryImports.createdAt))
            .limit(1),
        db
            .select({
                createdAt: productHistoryImports.createdAt,
                errorMessage: productHistoryImports.errorMessage,
            })
            .from(productHistoryImports)
            .where(
                and(
                    eq(productHistoryImports.marketplaceId, identity.marketplaceId),
                    eq(productHistoryImports.asin, identity.asin),
                    eq(productHistoryImports.source, 'keepa'),
                    eq(productHistoryImports.status, 'error')
                )
            )
            .orderBy(desc(productHistoryImports.createdAt))
            .limit(1),
        db
            .select({
                attemptCount: keepaHistoryRefreshQueue.attemptCount,
                lastAttemptAt: keepaHistoryRefreshQueue.lastAttemptAt,
                lastError: keepaHistoryRefreshQueue.lastError,
                nextAttemptAt: keepaHistoryRefreshQueue.nextAttemptAt,
            })
            .from(keepaHistoryRefreshQueue)
            .where(
                and(
                    eq(keepaHistoryRefreshQueue.marketplaceId, identity.marketplaceId),
                    eq(keepaHistoryRefreshQueue.asin, identity.asin)
                )
            )
            .limit(1),
    ]);
    const product = productRows[0] ?? null;
    const latestKeepaError = latestError(
        keepaErrorRows[0]?.createdAt ?? null,
        keepaErrorRows[0]?.errorMessage ?? null,
        queueRows[0]?.lastAttemptAt ?? null,
        queueRows[0]?.lastError ?? null
    );

    return mapProductProvenance({
        product,
        spApi: {
            latestAttemptAt: spApiAttemptRows[0]?.occurredAt ?? null,
            latestSuccessAt: spApiSuccessRows[0]?.occurredAt ?? null,
            latestError: eventError(spApiErrorRows[0]),
        },
        keepa: {
            latestAttemptAt: latestDate(
                keepaAttemptRows[0]?.createdAt ?? null,
                queueRows[0]?.lastAttemptAt ?? null
            ),
            latestSuccessAt: keepaSuccessRows[0]?.createdAt ?? null,
            latestError: latestKeepaError,
            retryAt:
                queueRows[0] && (queueRows[0].attemptCount > 0 || queueRows[0].lastError)
                    ? queueRows[0].nextAttemptAt
                    : null,
        },
    });
};

export const mapProductProvenance = ({
    product,
    spApi,
    keepa,
}: ProductProvenanceSource): ProductProvenance => ({
    spApi: {
        lastAttemptAt: toIso(
            latestDate(spApi.latestAttemptAt, product?.spApiFetchedAt, product?.spApiResolvedAt)
        ),
        lastSuccessAt: toIso(
            latestDate(spApi.latestSuccessAt, product?.spApiFetchedAt, product?.spApiResolvedAt)
        ),
        sourceObservedAt: null,
        suppliedDataCategories: getSpApiCategories(product),
        latestError: spApi.latestError,
        retryAt: null,
    },
    keepa: {
        lastAttemptAt: toIso(latestDate(keepa.latestAttemptAt, product?.keepaFetchedAt)),
        lastSuccessAt: toIso(latestDate(keepa.latestSuccessAt, product?.keepaFetchedAt)),
        sourceObservedAt: toIso(product?.keepaSourceUpdatedAt ?? null),
        suppliedDataCategories: getKeepaCategories(product),
        latestError: keepa.latestError,
        retryAt: toIso(keepa.retryAt),
    },
});

const getLatestProductEvent = async (
    identity: { marketplaceId: string; asin: string },
    status: string | undefined
) => {
    const conditions = [
        eq(eventLogs.marketplaceId, identity.marketplaceId),
        eq(eventLogs.asin, identity.asin),
        eq(eventLogs.action, 'product.sync'),
        ...(status ? [eq(eventLogs.status, status)] : []),
    ];
    return await db
        .select({
            occurredAt: eventLogs.occurredAt,
            status: eventLogs.status,
            message: eventLogs.message,
            detailsJson: eventLogs.detailsJson,
        })
        .from(eventLogs)
        .where(and(...conditions))
        .orderBy(desc(eventLogs.occurredAt))
        .limit(1);
};

const eventError = (
    event: { message: string; detailsJson: Record<string, unknown> } | undefined
) => {
    const detail = event?.detailsJson.error;
    return typeof detail === 'string' ? detail : (event?.message ?? null);
};

const getSpApiCategories = (product: ProductRow | null) => {
    if (!product) {
        return [];
    }
    return [
        product.title !== null ||
        product.brand !== null ||
        product.bullet1 !== null ||
        product.bullet2 !== null ||
        product.thumbnailUrl !== null ||
        product.dateFirstAvailable !== null
            ? 'listing'
            : null,
        product.rootCategoryId !== null ? 'category' : null,
        product.rootCategoryBsr !== null ? 'sales rank' : null,
    ].filter((value): value is string => value !== null);
};

const getKeepaCategories = (product: ProductRow | null) => {
    if (!product?.keepaFetchedAt) {
        return [];
    }

    return [
        product.keepaCurrentBsr !== null || product.keepaRootCategoryId !== null
            ? 'sales rank'
            : null,
        product.keepaCurrentNewPrice !== null ? 'price' : null,
        product.keepaMonthlySold !== null ? 'demand' : null,
        product.keepaSourceUpdatedAt !== null ||
        product.keepaFirstTrackedAt !== null ||
        product.keepaBsrAverage30 !== null ||
        product.keepaBsrAverage90 !== null ||
        product.keepaSalesRankDrops30 !== null ||
        product.keepaSalesRankDrops90 !== null ||
        product.keepaSalesRankDrops180 !== null ||
        product.keepaSalesRankDrops365 !== null
            ? 'history'
            : null,
    ].filter((value): value is string => value !== null);
};

const latestDate = (...values: Array<Date | null | undefined>) =>
    values.reduce<Date | null>(
        (latest, value) => (value && (!latest || value > latest) ? value : latest),
        null
    );

const latestError = (
    importAt: Date | null,
    importError: string | null,
    queueAt: Date | null,
    queueError: string | null
) => {
    if (queueAt && importAt && queueAt >= importAt) {
        return queueError ?? importError;
    }
    return importError ?? queueError;
};

const toIso = (value: Date | null | undefined) => value?.toISOString() ?? null;
