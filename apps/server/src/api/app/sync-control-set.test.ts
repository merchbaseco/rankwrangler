import { describe, expect, it, mock } from 'bun:test';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import { createSyncControlSet } from './sync-control-set';

describe('keyword sync control authorization', () => {
    it('lets an admin set an explicit pause value', async () => {
        const setPaused = mock(async (paused: boolean, _actor: string) => ({
            paused,
            updatedAt: null,
        }));
        const caller = router({ control: createSyncControlSet(setPaused) }).createCaller(
            context(true)
        );
        expect(await caller.control({ paused: true })).toMatchObject({ paused: true });
        expect(setPaused).toHaveBeenCalledWith(true, 'mbu_test');
    });
    it('rejects non-admin and API credentials before changing state', async () => {
        const setPaused = mock(async (paused: boolean, _actor: string) => ({
            paused,
            updatedAt: null,
        }));
        const route = router({ control: createSyncControlSet(setPaused) });
        await expect(
            route.createCaller(context(false)).control({ paused: true })
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(
            route.createCaller(context(true, 'api_key')).control({ paused: true })
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        expect(setPaused).not.toHaveBeenCalled();
    });
});

const context = (isAdmin: boolean, credentialKind: 'session' | 'api_key' = 'session') =>
    ({
        user: { sub: 'mbu_test' },
        isAdmin,
        authType: 'access' as const,
        credentialKind,
        authExpiresAtMs: null,
        accessPrincipal: {
            id: '11111111-1111-4111-8111-111111111111',
            service: 'rankwrangler' as const,
            merchbaseUserId: 'mbu_test',
        },
        accessError: null,
        request: { headers: {} },
    }) satisfies Context;
