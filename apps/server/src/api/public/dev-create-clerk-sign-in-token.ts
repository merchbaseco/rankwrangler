import { createClerkClient } from '@clerk/backend';
import { TRPCError } from '@trpc/server';
import { env } from '@/config/env.js';
import { publicProcedure } from '@/api/trpc.js';

const SIGN_IN_TOKEN_TTL_SECONDS = 60;

export const devCreateClerkSignInToken = publicProcedure.mutation(async ({ ctx }) => {
    const devSignInUserId = assertDevSignInIsEnabled();
    assertRequestIsLocalhost(ctx.request.headers.host);

    const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
    const signInToken = await clerkClient.signInTokens.createSignInToken({
        userId: devSignInUserId,
        expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
    });

    return {
        ticket: signInToken.token,
        expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
    };
});

const assertDevSignInIsEnabled = (): string => {
    if (process.env.NODE_ENV === 'production') {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Dev Clerk sign-in tokens are disabled in production',
        });
    }

    if (!env.DEV_CLERK_SIGN_IN_USER_ID) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Dev Clerk sign-in token flow is not configured',
        });
    }

    return env.DEV_CLERK_SIGN_IN_USER_ID;
};

const assertRequestIsLocalhost = (hostHeader?: string) => {
    if (!hostHeader) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Missing host header',
        });
    }

    const host = hostHeader.split(':')[0]?.toLowerCase();
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (isLocalhost) {
        return;
    }

    throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Dev Clerk sign-in tokens are only available on localhost',
    });
};
