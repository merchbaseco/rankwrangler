import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const apiProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.user) {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
        });
    }

    return next({
        ctx: {
            ...ctx,
        },
    });
});

export const publicApiProcedure = t.procedure.use(({ ctx, next }) => {
    if (ctx.authType !== 'license') {
        const message = ctx.licenseError ?? 'Valid license key required';
        const code = ctx.licenseError?.toLowerCase().includes('limit')
            ? 'TOO_MANY_REQUESTS'
            : 'UNAUTHORIZED';

        throw new TRPCError({
            code,
            message,
        });
    }

    return next({ ctx });
});

export const appProcedure = apiProcedure.use(({ ctx, next }) => {
    if (ctx.authType !== 'clerk') {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Clerk authentication required',
        });
    }

    return next({ ctx });
});

export const adminProcedure = appProcedure.use(({ ctx, next }) => {
    if (!ctx.isAdmin) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Admin access required',
        });
    }

    return next({ ctx });
});
