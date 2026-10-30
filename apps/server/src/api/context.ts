import type { ServiceAccessErrorCode } from '@merchbaseco/access';
import { ServiceAccessError } from '@merchbaseco/access';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { env } from '@/config/env.js';
import type { RankWranglerAccess } from '@/services/access/rankwrangler-access';

export interface MerchbaseUser {
    sub: string;
    email?: string;
}

export type AuthType = 'access' | 'none';
export type CredentialKind = 'api_key' | 'oauth' | 'session' | 'service_delegated';

export interface ContextRequest {
    method?: string;
    url?: string;
    headers: {
        authorization?: string;
        host?: string;
        'cf-access-jwt-assertion'?: string;
        'x-merchbase-user-id'?: string | string[];
    };
}

export const createContext = async (
    { req }: CreateFastifyContextOptions,
    access: RankWranglerAccess
) => {
    return await createRequestContext(
        { headers: req.headers, method: req.method, url: req.raw.url },
        access
    );
};

export const createRequestContext = async (
    request: ContextRequest,
    access: CredentialAccess | null = null
) => {
    if (!access) {
        return createUnauthenticatedContext(request, 'access_unavailable');
    }
    let result: Awaited<ReturnType<CredentialAccess['authorizeRequest']>>;
    try {
        result = await access.authorizeRequest({
            method: request.method,
            url: request.url,
            host: request.headers.host,
            assertion: request.headers['cf-access-jwt-assertion'],
            userIdHeader: request.headers['x-merchbase-user-id'],
        });
    } catch (error) {
        return createUnauthenticatedContext(
            request,
            error instanceof ServiceAccessError ? error.code : 'access_unavailable'
        );
    }

    const user: MerchbaseUser = { sub: result.principal.merchbaseUserId };
    return {
        user,
        isAdmin:
            result.credentialKind !== 'service_delegated' &&
            isAdminUser(result.principal.merchbaseUserId),
        authType: 'access' as const,
        credentialKind: result.credentialKind,
        authExpiresAtMs: result.expiresAtMs,
        accessPrincipal: result.principal,
        accessError: null,
        request,
    };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

type CredentialAccess = Pick<RankWranglerAccess, 'authorizeRequest'>;

const createUnauthenticatedContext = (
    request: ContextRequest,
    accessError: ServiceAccessErrorCode | null = null
) => ({
    user: null,
    isAdmin: false,
    authType: 'none' as const,
    credentialKind: null,
    authExpiresAtMs: null,
    accessPrincipal: null,
    accessError,
    request,
});

const isAdminUser = (merchbaseUserId: string) =>
    merchbaseUserId === env.RANKWRANGLER_ADMIN_MERCHBASE_USER_ID;
