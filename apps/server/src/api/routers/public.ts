import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { getProductInfoFromStore } from '@/db/product/get-product.js';
import { productIngestQueue } from '@/db/schema.js';
import { validateLicense } from '@/services/license.js';
import { trackApiRequest } from '@/services/posthog.js';
import { protectedProcedure, router } from '../trpc.js';

const getProductInfoInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
});

const licenseInput = z.object({
    licenseKey: z.string().min(1, 'License key is required'),
});

export const publicRouter = router({
    getProductInfo: protectedProcedure
        .input(getProductInfoInput)
        .mutation(async ({ input, ctx }) => {
            const { marketplaceId, asin } = input;
            const uid = ctx.user?.email ?? ctx.user?.sub ?? 'unknown';

            try {
                const cachedProduct = await getProductInfoFromStore(marketplaceId, asin);
                if (cachedProduct) {
                    trackApiRequest({
                        uid,
                        endpoint: 'public.getProductInfo',
                        marketplaceId,
                        asin,
                        cached: true,
                    });

                    return cachedProduct;
                }

                trackApiRequest({
                    uid,
                    endpoint: 'public.getProductInfo',
                    marketplaceId,
                    asin,
                    cached: false,
                });

                await db
                    .insert(productIngestQueue)
                    .values({ marketplaceId, asin })
                    .onConflictDoNothing();

                const maxAttempts = 50;
                for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));

                    const polledProduct = await getProductInfoFromStore(marketplaceId, asin);
                    if (polledProduct) {
                        return polledProduct;
                    }
                }

                throw new TRPCError({
                    code: 'TIMEOUT',
                    message: 'Request timeout: product info not available after 10 seconds',
                });
            } catch (error) {
                if (error instanceof TRPCError) {
                    throw error;
                }

                console.error(
                    `[${new Date().toISOString()}] Error getting product info:`,
                    error
                );
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown error occurred',
                });
            }
        }),
    license: router({
        validate: protectedProcedure.input(licenseInput).mutation(async ({ input }) => {
            const validation = await validateLicense(input.licenseKey);

            if (!validation.valid) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: validation.error ?? 'Invalid license key',
                });
            }

            return validation.data;
        }),
        status: protectedProcedure.input(licenseInput).mutation(async ({ input }) => {
            const validation = await validateLicense(input.licenseKey);

            if (!validation.valid) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: validation.error ?? 'Invalid license key',
                });
            }

            return validation.data;
        }),
    }),
});
