import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicApiProcedure } from '@/api/trpc.js';
import { fetchProductInfo } from '@/utils/product-info.js';
import { consumeLicenseUsageOrThrow } from './consume-license-usage.js';

const asinSchema = z
    .string()
    .min(1, 'ASIN is required')
    .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
    .transform(value => value.toUpperCase());

const getProductInfoBatchInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asins: z
        .array(asinSchema)
        .min(1, 'At least one ASIN is required')
        .max(100, 'A maximum of 100 ASINs is allowed per request')
        .transform(values => Array.from(new Set(values))),
});

export const getProductInfoBatch = publicApiProcedure
    .input(getProductInfoBatchInput)
    .mutation(async ({ input, ctx }) => {
        const asins = input.asins;

        await consumeLicenseUsageOrThrow(ctx, asins.length);

        const settledItems = await Promise.allSettled(
            asins.map(async asin => {
                const data = await fetchProductInfo({
                    marketplaceId: input.marketplaceId,
                    asin,
                });

                return {
                    asin,
                    success: true as const,
                    data,
                };
            })
        );

        const items = settledItems.map((result, index) => {
            const asin = asins[index];
            if (result.status === 'fulfilled') {
                return result.value;
            }

            const error = result.reason;
            const code = error instanceof TRPCError ? error.code : 'INTERNAL_SERVER_ERROR';
            const message =
                error instanceof TRPCError
                    ? error.message
                    : error instanceof Error
                      ? error.message
                      : 'Failed to fetch product info';

            return {
                asin,
                success: false as const,
                error: message,
                code,
            };
        });

        const successCount = items.filter(item => item.success).length;

        return {
            marketplaceId: input.marketplaceId,
            items,
            meta: {
                requestedCount: asins.length,
                successCount,
                errorCount: asins.length - successCount,
            },
        };
    });
