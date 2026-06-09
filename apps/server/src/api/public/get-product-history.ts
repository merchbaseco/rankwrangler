import { z } from 'zod';
import { publicApiProcedure } from '@/api/trpc.js';
import { productHistoryBuckets } from '@/services/product-history-buckets.js';
import {
    getProductHistorySurface,
    productHistoryMetrics,
} from '@/services/product-history-surface.js';
import { consumeLicenseUsageOrThrow } from './consume-license-usage.js';

const publicHistoryFormat = ['legacy', 'agent'] as const;

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
        metrics: z.array(z.enum(productHistoryMetrics)).min(1).max(2).optional(),
        format: z.enum(publicHistoryFormat).default('legacy'),
        bucket: z.enum(productHistoryBuckets).default('auto'),
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

        return await getProductHistorySurface({
            ...input,
            format: input.format,
            refresh: 'if_missing',
        });
    });
