import { z } from 'zod';
import { productHistoryBuckets } from '@/services/product-history-buckets.js';

const publicProductHistoryMetrics = ['salesRank', 'price'] as const;

export const asinInput = z
    .string()
    .min(1, 'ASIN is required')
    .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
    .transform(value => value.toUpperCase());

const productIdentityInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: asinInput,
});

export const productSummaryInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: asinInput,
    refresh: z.boolean().default(false),
});

export const productGetInput = productIdentityInput.strict();

export const productHistoryInput = productIdentityInput
    .extend({
        bucket: z.enum(productHistoryBuckets).default('auto'),
        days: z.coerce.number().int().min(30).max(3650).default(365),
        endAt: z.coerce.date().optional(),
        limit: z.coerce.number().int().min(1).max(10_000).default(5000),
        metrics: z
            .array(z.enum(publicProductHistoryMetrics))
            .min(1)
            .max(2)
            .default([...publicProductHistoryMetrics]),
        startAt: z.coerce.date().optional(),
    })
    .strict();
