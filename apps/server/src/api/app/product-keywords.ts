import { resolveProductIdentity } from '@/services/resolve-product-identity';
import { productIdentityInput } from '@/api/public/product-input';
import { appProcedure } from '@/api/trpc';
import { listProductKeywords } from '@/db/product-keywords';

export const productKeywords = appProcedure
    .input(productIdentityInput)
    .query(async ({ input }) => listProductKeywords(await resolveProductIdentity(input)));
