import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '@/config/env.js';
import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';
import { defineJob } from '@/jobs/job-router.js';
import {
    runProductFacetClassification,
    type ProductFacetClassificationCandidate,
} from '@/services/product-facet-classification.js';

const PRODUCT_FACET_CLASSIFICATION_BATCH_SIZE = 10;

export type ProcessProductFacetClassificationResult = {
    didWork: boolean;
    processedCount: number;
    successCount: number;
    failedCount: number;
    reason:
        | 'processed'
        | 'no_pending_products'
        | 'model_not_configured'
        | 'disabled';
};

export const processProductFacetClassification = async () => {
    if (isFacetsJobDisabled()) {
        return {
            didWork: false,
            processedCount: 0,
            successCount: 0,
            failedCount: 0,
            reason: 'disabled',
        } satisfies ProcessProductFacetClassificationResult;
    }

    if (!env.GEMINI_API_KEY) {
        return {
            didWork: false,
            processedCount: 0,
            successCount: 0,
            failedCount: 0,
            reason: 'model_not_configured',
        } satisfies ProcessProductFacetClassificationResult;
    }

    const pendingProducts = await getPendingProducts(
        PRODUCT_FACET_CLASSIFICATION_BATCH_SIZE
    );
    if (pendingProducts.length === 0) {
        return {
            didWork: false,
            processedCount: 0,
            successCount: 0,
            failedCount: 0,
            reason: 'no_pending_products',
        } satisfies ProcessProductFacetClassificationResult;
    }

    let successCount = 0;
    let failedCount = 0;

    for (const pendingProduct of pendingProducts) {
        try {
            const result = await runProductFacetClassification({
                product: pendingProduct,
                source: 'product_facet_classification_job',
                jobName: 'process-product-facet-classification',
            });

            console.log(
                `[Product Facets] Classified ${pendingProduct.marketplaceId}/${pendingProduct.asin}. ` +
                    `tokens(input=${result.usage.inputTokens}, cached=${result.usage.cachedInputTokens}, output=${result.usage.outputTokens}) ` +
                    `cost=$${result.costUsd.toFixed(6)}`
            );
            successCount += 1;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(
                `[Product Facets] Classification failed for ${pendingProduct.marketplaceId}/${pendingProduct.asin}: ${errorMessage}`
            );
            failedCount += 1;
        }
    }

    return {
        didWork: true,
        processedCount: pendingProducts.length,
        successCount,
        failedCount,
        reason: 'processed',
    } satisfies ProcessProductFacetClassificationResult;
};

export const processProductFacetClassificationJob = defineJob(
    'process-product-facet-classification',
    { persistSuccess: 'didWork' }
)
    .input(z.record(z.string(), z.unknown()))
    .options({
        singletonKey: 'process-product-facet-classification',
        retryLimit: 0,
    })
    .interval({
        everyMs: 60 * 1000,
        payload: {},
    })
    .work(async (_job, signal, log) => {
        void signal;
        const result = await processProductFacetClassification();

        if (result.didWork) {
            log('Processed product facet classification batch', result);
        }

        return result;
    });

const getPendingProducts = async (limit: number) => {
    const pendingProducts = await db
        .select({
            asin: products.asin,
            marketplaceId: products.marketplaceId,
            title: products.title,
            brand: products.brand,
            bullet1: products.bullet1,
            bullet2: products.bullet2,
            thumbnailUrl: products.thumbnailUrl,
        })
        .from(products)
        .where(eq(products.facetsState, 'pending'))
        .orderBy(asc(products.lastFetched))
        .limit(limit);

    return pendingProducts as ProductFacetClassificationCandidate[];
};

const isFacetsJobDisabled = () => true;
