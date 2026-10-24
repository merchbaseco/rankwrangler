import { describe, expect, it, mock } from 'bun:test';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import { createCollectionStatusProcedure } from './collection-status';

const snapshot = {
    observedAt: '2026-10-23T12:00:00.000Z',
    keepa: {
        observedAt: null,
        refillRate: null,
        estimatedTokensLeft: null,
        fresh: false,
        productCost: null,
        headCost: null,
        interactiveFloor: null,
        interactiveWaiting: 0,
        rollingHour: [],
        lending: { historyDue: false, headDue: false, interactiveWaiting: false },
    },
    history: {
        admissions: [],
        overload: { overdueCount: 0, oldestOverdueAt: null, newAdmissionsPaused: false },
    },
    keywords: [],
    exploration: {
        source: 'spapi' as const,
        passes: [],
        attempts24h: [],
        globalLimit24h: 20,
        keywordLimit24h: 10,
    },
};

describe('admin collection status', () => {
    it('returns the persisted snapshot to an admin session', async () => {
        const readStatus = mock(() => Promise.resolve(snapshot));
        const caller = router({
            collectionStatus: createCollectionStatusProcedure(readStatus),
        }).createCaller(context(true));
        expect(await caller.collectionStatus()).toEqual(snapshot);
        expect(readStatus).toHaveBeenCalledTimes(1);
    });
    it('rejects non-admin sessions before reading operational data', async () => {
        const readStatus = mock(() => Promise.resolve(snapshot));
        const caller = router({
            collectionStatus: createCollectionStatusProcedure(readStatus),
        }).createCaller(context(false));
        await expect(caller.collectionStatus()).rejects.toMatchObject({ code: 'FORBIDDEN' });
        expect(readStatus).not.toHaveBeenCalled();
    });
    it('rejects API credentials even for an admin identity', async () => {
        const readStatus = mock(() => Promise.resolve(snapshot));
        const caller = router({
            collectionStatus: createCollectionStatusProcedure(readStatus),
        }).createCaller(context(true, 'api_key'));
        await expect(caller.collectionStatus()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        expect(readStatus).not.toHaveBeenCalled();
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
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
            usageToday: 0,
            usageCount: 0,
            usageLimit: 100_000,
            lastResetAt: new Date(),
        },
        accessError: null,
        request: { headers: {} },
    }) satisfies Context;
