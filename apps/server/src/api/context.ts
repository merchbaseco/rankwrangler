import type { ServiceAccessErrorCode } from '@merchbaseco/access';
import { ServiceAccessError } from '@merchbaseco/access';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { env } from '@/config/env.js';
import type {
    RankWranglerAccess,
    RankWranglerServicePrincipal,
} from '@/services/access/rankwrangler-access';

export interface ClerkUser {
    sub: string;
    email?: string;
}

export type AuthType = 'access' | 'none';
export type CredentialKind = 'api_key' | 'oauth' | 'session';

export interface ContextRequest {
    headers: {
        authorization?: string;
        host?: string;
    };
}

export const createContext = async (
    { req }: CreateFastifyContextOptions,
    access: RankWranglerAccess
) => {
    return await createRequestContext(req, access);
};

export const createRequestContext = async (
    request: ContextRequest,
    access: CredentialAccess | null = null
) => {
    const token = getBearerToken(request.headers.authorization);
    if (!token) {
        return createUnauthenticatedContext(request);
    }
    if (!access) {
        return createUnauthenticatedContext(request, 'access_unavailable');
    }

    const result = await authorizeCredential(token, access);
    if ('error' in result) {
        return createUnauthenticatedContext(request, result.error ?? 'access_unavailable');
    }

    const user: ClerkUser = { sub: result.principal.merchbaseUserId };
    return {
        user,
        isAdmin: isAdminUser(result.principal.merchbaseUserId),
        authType: 'access' as const,
        credentialKind: result.credentialKind,
        authExpiresAtMs: result.expiresAtMs,
        accessPrincipal: result.principal,
        accessError: null,
        request,
    };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

type CredentialAccess = Pick<RankWranglerAccess, 'apiKeyAccess' | 'oauthAccess' | 'sessionAccess'>;

const getBearerToken = (authorization?: string) => {
    if (!authorization) {
        return null;
    }
    if (!authorization.startsWith('Bearer ')) {
        return null;
    }
    const token = authorization.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
};

const createUnauthenticatedContext = (
    request: ContextRequest,
    accessError: ServiceAccessErrorCode | null = null
) => {
    return {
        user: null,
        isAdmin: false,
        authType: 'none' as const,
        credentialKind: null,
        authExpiresAtMs: null,
        accessPrincipal: null,
        accessError,
        request,
    };
};

const authorizeCredential = async (token: string, access: CredentialAccess) => {
    const credentialKind = classifyCredential(token);
    if (credentialKind === 'api_key') {
        return authorizeWith(access.apiKeyAccess, token, 'api_key', null);
    }
    if (credentialKind === 'oauth') {
        return authorizeWith(access.oauthAccess, token, 'oauth', null);
    }

    const sessionResult = await authorizeWith(access.sessionAccess, token, 'session');
    if (!('error' in sessionResult)) {
        return sessionResult;
    }
    if (!(sessionResult.error && shouldTryOAuth(sessionResult.error))) {
        return sessionResult;
    }

    return authorizeWith(access.oauthAccess, token, 'oauth', null);
};

const authorizeWith = async (
    serviceAccess: {
        authorize: (token: string) => Promise<{
            credentialKind: CredentialKind;
            principal: RankWranglerServicePrincipal;
        }>;
    },
    token: string,
    credentialKind: CredentialKind,
    expiresAtMs: number | null = readJwtExpiry(token)
) => {
    try {
        const authorized = await serviceAccess.authorize(token);
        return { ...authorized, credentialKind, expiresAtMs };
    } catch (error) {
        if (error instanceof ServiceAccessError) {
            return { error: error.code } as const;
        }
        return { error: 'access_unavailable' as const };
    }
};

const classifyCredential = (token: string): CredentialKind => {
    if (token.startsWith('ak_')) {
        return 'api_key';
    }
    if (token.startsWith('oat_')) {
        return 'oauth';
    }
    return 'session';
};

const shouldTryOAuth = (error: ServiceAccessErrorCode) =>
    error === 'unauthenticated' || error === 'insufficient_scope';

const readJwtExpiry = (token: string) => {
    const [, encodedPayload] = token.split('.');
    if (!encodedPayload) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
            exp?: unknown;
        };
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
};

const isAdminUser = (merchbaseUserId: string) => merchbaseUserId === env.RANKWRANGLER_ADMIN_MERCHBASE_USER_ID;
