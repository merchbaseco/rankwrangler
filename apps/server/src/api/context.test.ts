import { describe, expect, it, mock } from 'bun:test';
import type { RankWranglerAccess } from '@/services/access/rankwrangler-access';

describe('centralized credential routing', () => {
    it('routes ak_ credentials to API-key access', async () => {
        const { createRequestContext } = await loadSubject();
        const access = createAccess();

        const context = await createRequestContext(
            { headers: { authorization: 'Bearer ak_test' } },
            access
        );

        expect(context.authType).toBe('access');
        expect(context.credentialKind).toBe('api_key');
        expect(access.apiKeyAccess.authorize).toHaveBeenCalledWith('ak_test');
        expect(access.oauthAccess.authorize).not.toHaveBeenCalled();
        expect(access.sessionAccess.authorize).not.toHaveBeenCalled();
    });

    it('routes oat_ credentials to OAuth access', async () => {
        const { createRequestContext } = await loadSubject();
        const access = createAccess();

        const context = await createRequestContext(
            { headers: { authorization: 'Bearer oat_test' } },
            access
        );

        expect(context.credentialKind).toBe('oauth');
        expect(access.oauthAccess.authorize).toHaveBeenCalledWith('oat_test');
        expect(access.apiKeyAccess.authorize).not.toHaveBeenCalled();
        expect(access.sessionAccess.authorize).not.toHaveBeenCalled();
    });

    it('falls back from an unauthenticated session token to OAuth', async () => {
        const { createRequestContext } = await loadSubject();
        const access = createAccess({ sessionError: 'unauthenticated' });

        const context = await createRequestContext(
            { headers: { authorization: 'Bearer eyJhbGciOiJub25lIn0.token' } },
            access
        );

        expect(context.authType).toBe('access');
        expect(context.credentialKind).toBe('oauth');
        expect(access.sessionAccess.authorize).toHaveBeenCalled();
        expect(access.oauthAccess.authorize).toHaveBeenCalled();
    });

    it('keeps access denial explicit and does not expose the credential', async () => {
        const { createRequestContext } = await loadSubject();
        const access = createAccess({ apiKeyError: 'access_denied' });

        const context = await createRequestContext(
            { headers: { authorization: 'Bearer ak_private' } },
            access
        );

        expect(context.authType).toBe('none');
        expect(context.accessError).toBe('access_denied');
        expect(context).not.toHaveProperty('token');
    });
});

const loadSubject = async () => {
    process.env.SPAPI_REFRESH_TOKEN ??= 'test-refresh';
    process.env.SPAPI_CLIENT_ID ??= 'test-client';
    process.env.SPAPI_APP_CLIENT_SECRET ??= 'test-secret';
    process.env.CLERK_SECRET_KEY ??= 'test-clerk';
    process.env.CLERK_PUBLISHABLE_KEY ??= 'pk_test_rankwrangler';
    process.env.CLERK_JWT_KEY ??= 'test-jwt-key';
    process.env.CLERK_ISSUER ??= 'https://clerk.test';
    process.env.CLERK_AUTHORIZED_PARTIES ??= 'https://app.test';
    process.env.CLERK_WEBHOOK_SIGNING_SECRET ??= 'test-webhook-secret';
    return await import('./context');
};

const createAccess = (
    options: { apiKeyError?: 'access_denied'; sessionError?: 'unauthenticated' } = {}
): Pick<RankWranglerAccess, 'apiKeyAccess' | 'oauthAccess' | 'sessionAccess'> => {
    const principal = {
        id: '11111111-1111-4111-8111-111111111111',
        service: 'rankwrangler' as const,
        merchbaseUserId: 'mbu_context_test',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        lastUsedAt: null,
        usageToday: 0,
        usageCount: 0,
        usageLimit: 100,
        lastResetAt: new Date('2026-07-01T00:00:00.000Z'),
    };
    const authorized = async () => ({ principal, credentialKind: 'session' as const });
    const denied = () => Promise.reject(new Error('unconfigured credential mock'));
    const apiKeyAuthorize = options.apiKeyError
        ? mock(async () => {
              const { ServiceAccessError } = await import('@merchbaseco/access');
              throw new ServiceAccessError(options.apiKeyError ?? 'access_denied');
          })
        : mock(authorized);
    const sessionAuthorize = options.sessionError
        ? mock(async () => {
              const { ServiceAccessError } = await import('@merchbaseco/access');
              throw new ServiceAccessError(options.sessionError ?? 'unauthenticated');
          })
        : mock(denied);

    return {
        apiKeyAccess: { authorize: apiKeyAuthorize },
        oauthAccess: {
            authorize: mock(async () => ({ principal, credentialKind: 'oauth' as const })),
        },
        sessionAccess: { authorize: sessionAuthorize },
    } as unknown as Pick<RankWranglerAccess, 'apiKeyAccess' | 'oauthAccess' | 'sessionAccess'>;
};
