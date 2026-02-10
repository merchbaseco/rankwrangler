import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createLicense } from '@/services/license.js';
import { adminProcedure } from '@/api/trpc.js';

const generateLicenseInput = z.object({
    email: z.string().email('Valid email is required'),
    unlimited: z.boolean().optional().default(false),
});

export const licenseGenerate = adminProcedure
    .input(generateLicenseInput)
    .mutation(async ({ input }) => {
        try {
            const license = await createLicense(input.email, input.unlimited);

            console.log(`[Admin] Generated license for ${input.email}`);

            return {
                licenseKey: license.key,
                email: license.email,
            };
        } catch (error) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: error instanceof Error ? error.message : 'Failed to create license',
            });
        }
    });
