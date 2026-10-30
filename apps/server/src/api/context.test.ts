import { describe, expect, it, mock } from 'bun:test';
import { ServiceAccessError } from '@merchbaseco/access';
import type { RankWranglerServicePrincipal } from '@/services/access/rankwrangler-access';
import { createRequestContext } from './context';

const principal: RankWranglerServicePrincipal = {
    id: '11111111-1111-4111-8111-111111111111',
    service: 'rankwrangler',
    merchbaseUserId: 'mbu_context_test',
};
const result = {
    principal,
    merchbaseUserId: principal.merchbaseUserId,
    credentialKind: 'session' as const,
    expiresAtMs: 1_900_000_000_000,
    service: 'rankwrangler' as const,
};
describe('Cloudflare request context', () => {
    it('forwards only the origin assertion, raw host and forbidden delegation header to the boundary', async () => {
        const authorizeRequest = mock(async () => result);
        const request = {
            headers: {
                host: 'rankwrangler.merchbase.co',
                authorization: 'Bearer irrelevant',
                'cf-access-jwt-assertion': 'signed',
                'x-merchbase-user-id': 'forged',
            },
        };
        const context = await createRequestContext(request, { authorizeRequest });
        expect(authorizeRequest).toHaveBeenCalledWith({
            host: request.headers.host,
            assertion: 'signed',
            userIdHeader: 'forged',
        });
        expect(context.user).toEqual({ sub: principal.merchbaseUserId });
        expect(context.credentialKind).toBe('session');
        expect(context.authExpiresAtMs).toBe(result.expiresAtMs);
        expect(context).not.toHaveProperty('token');
    });
    it('preserves safe denied and unavailable outcomes', async () => {
        for (const code of ['access_denied', 'access_unavailable', 'unauthenticated'] as const) {
            const context = await createRequestContext(
                { headers: {} },
                {
                    authorizeRequest: () => Promise.reject(new ServiceAccessError(code)),
                }
            );
            expect(context.authType).toBe('none');
            expect(context.accessError).toBe(code);
            expect(context.isAdmin).toBe(false);
        }
    });
});
