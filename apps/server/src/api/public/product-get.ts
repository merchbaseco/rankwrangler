import { publicApiProcedure } from '@/api/trpc.js';
import { getProductReadModel } from '@/services/product-read-model.js';
import { consumeLicenseUsageOrThrow } from './consume-license-usage.js';
import { productGetInput } from './product-input.js';

export const productGet = publicApiProcedure
    .input(productGetInput)
    .mutation(async ({ input, ctx }) => {
        await consumeLicenseUsageOrThrow(ctx, 1);

        return await getProductReadModel(input);
    });
