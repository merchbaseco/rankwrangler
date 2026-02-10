import { TRPCError } from '@trpc/server';
import { publicApiProcedure } from '@/api/trpc.js';

export const licenseValidate = publicApiProcedure.mutation(({ ctx }) => {
    if (!ctx.license?.data) {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Valid license key required',
        });
    }

    return ctx.license.data;
});
