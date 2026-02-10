import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { resetLicenseUsage } from '@/services/license.js';
import { adminProcedure } from '@/api/trpc.js';

const licenseIdInput = z.object({
    licenseId: z.string().min(1, 'License ID is required'),
});

export const licenseReset = adminProcedure
    .input(licenseIdInput)
    .mutation(async ({ input }) => {
        const success = await resetLicenseUsage(input.licenseId);

        if (!success) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'License not found',
            });
        }

        console.log(`[Admin] Reset usage for license ID: ${input.licenseId}`);

        return { reset: true };
    });
