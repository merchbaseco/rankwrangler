import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { adminProcedure } from '@/api/trpc.js';
import { env } from '@/config/env.js';
import {
    getProductFacetClassificationCandidate,
    runProductFacetClassification,
} from '@/services/product-facet-classification.js';

const classifyProductFacetsInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
});

export const classifyProductFacets = adminProcedure
    .input(classifyProductFacetsInput)
    .mutation(async ({ input }) => {
        if (!env.GEMINI_API_KEY) {
            throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: 'GEMINI_API_KEY is required for product facet classification.',
            });
        }

        const product = await getProductFacetClassificationCandidate({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
        });

        if (!product) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: `Product ${input.asin} not found in marketplace ${input.marketplaceId}.`,
            });
        }

        if (product.facetsState === 'ready') {
            return { status: 'already_ready' } as const;
        }

        const classificationResult = await runProductFacetClassification({
            product,
            source: 'product_facet_manual_classification',
            jobName: 'manual-product-facet-classification',
        });

        return {
            status: 'classified',
            costUsd: classificationResult.costUsd,
            usage: classificationResult.usage,
        } as const;
    });
