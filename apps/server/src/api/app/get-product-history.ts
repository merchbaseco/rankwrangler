import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { getProductHistoryPoints, keepaHistoryMetricKeys } from '@/services/keepa.js';

const getProductHistoryInput = z
    .object({
        marketplaceId: z.string().min(1, 'Marketplace ID is required'),
        asin: z
            .string()
            .min(1, 'ASIN is required')
            .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
            .transform(value => value.toUpperCase()),
        metric: z.enum(keepaHistoryMetricKeys),
        categoryId: z.coerce.number().optional(),
        startAt: z.coerce.date().optional(),
        endAt: z.coerce.date().optional(),
        limit: z.coerce.number().int().min(1).max(10000).default(5000),
    })
    .superRefine((input, ctx) => {
        if (input.metric === 'bsrCategory' && typeof input.categoryId !== 'number') {
            return;
        }

        if (input.metric !== 'bsrCategory' && typeof input.categoryId === 'number') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'categoryId is only valid when metric is bsrCategory',
                path: ['categoryId'],
            });
        }
    });

export const getProductHistory = appProcedure.input(getProductHistoryInput).query(async ({ input }) => {
    return getProductHistoryPoints({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        metric: input.metric,
        categoryId: input.categoryId,
        startAt: input.startAt,
        endAt: input.endAt,
        limit: input.limit,
    });
});
