import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
    createLicense,
    deleteLicense,
    getLicenseById,
    listLicenses,
    resetLicenseUsage,
} from '@/services/license.js';
import { adminProcedure, router } from '../trpc.js';

const generateLicenseInput = z.object({
    email: z.string().email('Valid email is required'),
    unlimited: z.boolean().optional().default(false),
});

const licenseIdInput = z.object({
    licenseId: z.string().min(1, 'License ID is required'),
});

const licenseDetailsInput = z.object({
    searchBy: z.enum(['id', 'email', 'key']),
    value: z.string().min(1, 'Search value is required'),
});

export const adminRouter = router({
    license: router({
        generate: adminProcedure.input(generateLicenseInput).mutation(async ({ input }) => {
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
        }),
        list: adminProcedure.query(async () => {
            return listLicenses();
        }),
        details: adminProcedure.input(licenseDetailsInput).query(async ({ input }) => {
            const license = await getLicenseById(input.searchBy, input.value);

            if (!license) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'License not found',
                });
            }

            return license;
        }),
        delete: adminProcedure.input(licenseIdInput).mutation(async ({ input }) => {
            const success = await deleteLicense(input.licenseId);

            if (!success) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'License not found',
                });
            }

            console.log(`[Admin] Deleted license ID: ${input.licenseId}`);

            return { deleted: true };
        }),
        reset: adminProcedure.input(licenseIdInput).mutation(async ({ input }) => {
            const success = await resetLicenseUsage(input.licenseId);

            if (!success) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'License not found',
                });
            }

            console.log(`[Admin] Reset usage for license ID: ${input.licenseId}`);

            return { reset: true };
        }),
    }),
});
