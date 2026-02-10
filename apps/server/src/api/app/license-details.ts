import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getLicenseById } from '@/services/license.js';
import { adminProcedure } from '@/api/trpc.js';

const licenseDetailsInput = z.object({
    searchBy: z.enum(['id', 'email', 'key']),
    value: z.string().min(1, 'Search value is required'),
});

export const licenseDetails = adminProcedure
    .input(licenseDetailsInput)
    .query(async ({ input }) => {
        const license = await getLicenseById(input.searchBy, input.value);

        if (!license) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'License not found',
            });
        }

        return license;
    });
