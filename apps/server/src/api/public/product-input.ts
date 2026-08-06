import { z } from 'zod';
import { productHistoryBuckets } from '@/services/product-history-buckets.js';
import { productHistoryMetrics } from '@/services/product-history-surface.js';

const publicHistoryFormat = ['legacy', 'agent'] as const;

export const asinInput = z
    .string()
    .min(1, 'ASIN is required')
    .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
    .transform(value => value.toUpperCase());

export const productSummaryInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: asinInput,
    refresh: z.boolean().default(false),
});

export const productGetInput = productSummaryInput.extend({
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(10_000).default(5000),
    days: z.coerce.number().int().min(30).max(3650).default(365),
    metrics: z.array(z.enum(productHistoryMetrics)).min(1).max(2).optional(),
    bucket: z.enum(productHistoryBuckets).default('auto'),
});

export const productHistoryInput = productGetInput
    .extend({
        format: z.enum(publicHistoryFormat).default('legacy'),
        refresh: z.boolean().default(false),
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
