import { z } from 'zod';
import { adminProcedure } from '@/api/trpc';
import {
    getProviderTelemetry,
    keepaProviderOperations,
    spApiProviderOperations,
} from '@/services/providers/provider-telemetry';

const commonInput = {
    hours: z
        .number()
        .int()
        .min(1)
        .max(7 * 24)
        .default(24),
};

export const providerTelemetryGet = adminProcedure
    .input(
        z.union([
            z.object({ ...commonInput, provider: z.undefined().optional() }).strict(),
            z
                .object({
                    ...commonInput,
                    provider: z.literal('keepa'),
                    operation: z.enum(keepaProviderOperations).optional(),
                })
                .strict(),
            z
                .object({
                    ...commonInput,
                    provider: z.literal('spapi'),
                    operation: z.enum(spApiProviderOperations).optional(),
                })
                .strict(),
        ]).optional()
    )
    .query(async ({ input }) => {
        return await getProviderTelemetry(input ?? { hours: 24 });
    });
