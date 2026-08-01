import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { requestProductHistoryRefresh } from '@/services/product-history-operations.js';
import { fetchProductInfo } from '@/utils/product-info.js';

const loadProductHistoryInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
    days: z.coerce.number().int().min(30).max(3650).default(365),
});

type LoadProductHistoryInput = z.infer<typeof loadProductHistoryInput>;

interface LoadProductHistoryDeps {
    fetchProductInfo: typeof fetchProductInfo;
    requestProductHistoryRefresh: typeof requestProductHistoryRefresh;
}

const loadProductHistoryDeps: LoadProductHistoryDeps = {
    fetchProductInfo,
    requestProductHistoryRefresh,
};

export const requestManualProductHistorySync = async ({
    input,
    ownerMerchbaseUserId,
    deps = loadProductHistoryDeps,
}: {
    input: LoadProductHistoryInput;
    ownerMerchbaseUserId: string;
    deps?: LoadProductHistoryDeps;
}) => {
    await deps.fetchProductInfo({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
    });

    return await deps.requestProductHistoryRefresh({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        ownerMerchbaseUserId,
    });
};

export const loadProductHistory = appProcedure
    .input(loadProductHistoryInput)
    .mutation(async ({ input, ctx }) => {
        return await requestManualProductHistorySync({
            input,
            ownerMerchbaseUserId: ctx.accessPrincipal.merchbaseUserId,
        });
    });
