import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';
import { classifyProductFacets } from '@/services/product-facet-classifier.js';
import { estimateProductFacetClassificationCost } from '@/services/product-facet-cost.js';
import { createEventLogSafe } from '@/services/event-logs.js';
import {
    markProductFacetClassificationError,
    replaceProductFacetsByMarketplaceAsin,
} from '@/services/product-facet-store.js';

export type ProductFacetClassificationUsage = {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
};

export type ProductFacetClassificationCandidate = {
    asin: string;
    marketplaceId: string;
    title: string | null;
    brand: string | null;
    bullet1: string | null;
    bullet2: string | null;
    thumbnailUrl: string | null;
};

export type ProductFacetClassificationCandidateWithState =
    ProductFacetClassificationCandidate & {
        facetsState: string;
    };

export type ProductFacetClassificationResult = {
    costUsd: number;
    usage: ProductFacetClassificationUsage;
};

export const getProductFacetClassificationCandidate = async ({
    asin,
    marketplaceId,
}: {
    asin: string;
    marketplaceId: string;
}) => {
    const rows = await db
        .select({
            asin: products.asin,
            marketplaceId: products.marketplaceId,
            title: products.title,
            brand: products.brand,
            bullet1: products.bullet1,
            bullet2: products.bullet2,
            thumbnailUrl: products.thumbnailUrl,
            facetsState: products.facetsState,
        })
        .from(products)
        .where(
            and(
                eq(products.marketplaceId, marketplaceId),
                eq(products.asin, asin)
            )
        )
        .limit(1);

    return rows[0] ?? null;
};

export const runProductFacetClassification = async ({
    product,
    source,
    jobName,
}: {
    product: ProductFacetClassificationCandidate;
    source: 'product_facet_classification_job' | 'product_facet_manual_classification';
    jobName: string;
}): Promise<ProductFacetClassificationResult> => {
    try {
        const result = await classifyProductFacets({
            brand: product.brand,
            bullet1: product.bullet1,
            bullet2: product.bullet2,
            thumbnailUrl: product.thumbnailUrl,
            title: product.title,
        });

        await replaceProductFacetsByMarketplaceAsin({
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            classification: result.classification,
        });

        const costUsd = estimateProductFacetClassificationCost(result.usage);

        await createEventLogSafe({
            level: 'info',
            status: 'success',
            category: 'product',
            action: 'product.facets.classify',
            primitiveType: 'product',
            message: `Classified facets for ${product.asin}.`,
            detailsJson: {
                source,
                costUsd,
                inputTokens: result.usage.inputTokens,
                cachedInputTokens: result.usage.cachedInputTokens,
                outputTokens: result.usage.outputTokens,
                totalTokens: result.usage.totalTokens,
            },
            primitiveId: product.asin,
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            jobName,
        });

        return {
            costUsd,
            usage: {
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                totalTokens: result.usage.totalTokens,
                cachedInputTokens: result.usage.cachedInputTokens,
            },
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        await markProductFacetClassificationError({
            marketplaceId: product.marketplaceId,
            asin: product.asin,
        });

        await createEventLogSafe({
            level: 'error',
            status: 'failed',
            category: 'product',
            action: 'product.facets.classify',
            primitiveType: 'product',
            message: `Facet classification failed for ${product.asin}.`,
            detailsJson: {
                source,
                error: errorMessage,
            },
            primitiveId: product.asin,
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            jobName,
        });

        throw error;
    }
};
