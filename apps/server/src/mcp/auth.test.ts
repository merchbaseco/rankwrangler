import { describe, expect, it, mock } from 'bun:test';
import { ServiceAccessError } from '@merchbaseco/access';
import { authenticateMcpRequest } from './auth';

describe('RankWrangler MCP authentication', () => {
    it('requires a bearer token before shared OAuth authorization', async () => {
        const authorize = mock(async () => ({
            merchbaseUserId: 'mbu_test',
            principal: {},
        }));

        await expect(authenticateMcpRequest(undefined, { authorize })).resolves.toEqual({
            status: 'unauthorized',
        });
        expect(authorize).not.toHaveBeenCalled();
    });

    it('maps shared access failures to MCP auth outcomes', async () => {
        await expect(
            authenticateMcpRequest('Bearer oauth-token', {
                authorize: mock(() => {
                    throw new ServiceAccessError('access_unavailable');
                }),
            })
        ).resolves.toEqual({ status: 'unavailable' });

        await expect(
            authenticateMcpRequest('Bearer oauth-token', {
                authorize: mock(() => {
                    throw new ServiceAccessError('access_denied');
                }),
            })
        ).resolves.toEqual({ missingScopes: [], status: 'forbidden' });

        await expect(
            authenticateMcpRequest('Bearer oauth-token', {
                authorize: mock(() => {
                    throw new ServiceAccessError('unauthenticated');
                }),
            })
        ).resolves.toEqual({ status: 'unauthorized' });
    });

    it('maps unexpected authorization backend failures to temporary unavailability', async () => {
        await expect(
            authenticateMcpRequest('Bearer oauth-token', {
                authorize: mock(() => {
                    throw new Error('database unavailable');
                }),
            })
        ).resolves.toEqual({ status: 'unavailable' });
    });

    it('returns stable MCP auth info for an authorized OAuth caller', async () => {
        await expect(
            authenticateMcpRequest('Bearer oauth-token', {
                authorize: mock(async () => ({
                    merchbaseUserId: 'mbu_test',
                    principal: { id: 'principal_test' },
                })),
            })
        ).resolves.toMatchObject({
            authInfo: {
                clientId: 'clerk',
                extra: { merchbaseUserId: 'mbu_test' },
                scopes: ['openid', 'email', 'profile'],
                token: 'oauth-token',
            },
            merchbaseUserId: 'mbu_test',
            status: 'authenticated',
        });
    });
});
