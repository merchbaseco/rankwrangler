import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { deleteLicense } from '@/services/license.js';
import { adminProcedure } from '@/api/trpc.js';

const licenseIdInput = z.object({
    licenseId: z.string().min(1, 'License ID is required'),
});

export const licenseDelete = adminProcedure
    .input(licenseIdInput)
    .mutation(async ({ input }) => {
        const success = await deleteLicense(input.licenseId);

        if (!success) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'License not found',
            });
        }

        console.log(`[Admin] Deleted license ID: ${input.licenseId}`);

        return { deleted: true };
    });
