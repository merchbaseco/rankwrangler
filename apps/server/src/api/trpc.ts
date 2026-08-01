import type { ServiceAccessErrorCode } from '@merchbaseco/access';
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const apiProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.user) {
        throw new TRPCError({
            code: mapAccessErrorCode(ctx.accessError),
            message: accessErrorMessage(ctx.accessError),
        });
    }

    return next({
        ctx: {
            ...ctx,
        },
    });
});

export const publicApiProcedure = t.procedure.use(({ ctx, next }) => {
    if (ctx.authType !== 'access' || !ctx.accessPrincipal) {
        throw new TRPCError({
            code: mapAccessErrorCode(ctx.accessError),
            message: accessErrorMessage(ctx.accessError),
        });
    }

    return next({ ctx });
});

export const appProcedure = apiProcedure.use(({ ctx, next }) => {
    if (ctx.authType !== 'access' || ctx.credentialKind !== 'session') {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Clerk session authentication required',
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

const accessErrorMessage = (error: ServiceAccessErrorCode | null) => {
    switch (error) {
        case 'access_denied':
            return 'RankWrangler access is not granted.';
        case 'insufficient_scope':
            return 'Credential scope is insufficient.';
        case 'access_unavailable':
            return 'RankWrangler access is temporarily unavailable.';
        case 'unauthenticated':
            return 'Authentication required.';
        default:
            return 'Authentication required.';
    }
};

export const mapAccessErrorCode = (
    error: ServiceAccessErrorCode | null
): 'FORBIDDEN' | 'SERVICE_UNAVAILABLE' | 'UNAUTHORIZED' => {
    if (error === 'access_denied') {
        return 'FORBIDDEN';
    }
    if (error === 'access_unavailable') {
        return 'SERVICE_UNAVAILABLE';
    }
    return 'UNAUTHORIZED';
};
