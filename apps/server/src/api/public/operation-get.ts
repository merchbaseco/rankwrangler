import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicApiProcedure } from '@/api/trpc.js';
import { getOperationById } from '@/db/operations.js';
import { buildPublicOperation } from '@/services/operations.js';

export const operationGet = publicApiProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
        const operation = await getOperationById(input.id);
        if (!operation) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Operation not found',
            });
        }

        return buildPublicOperation(operation);
    });
