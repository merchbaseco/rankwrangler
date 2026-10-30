import { describe, expect, it } from 'bun:test';
import type { AccessProjectionStore } from '@merchbaseco/access';
import { IDENTITY_LOOKUP_MS, memoizeIdentityLookups, memoizePrincipals } from './access-lookup-memo';

const identity = { issuer: 'https://issuer.example', subject: 'mbu_memo' };

const countingStore = () => {
    const calls = { find: 0 };
    let state: Awaited<ReturnType<AccessProjectionStore['findByIdentity']>> = { type: 'missing' };
    const store: AccessProjectionStore = {
        apply: async () => {
            state = { type: 'tombstone' };
        },
        findByIdentity: async () => {
            calls.find += 1;
            return state;
        },
        findByMerchbaseUserId: async () => null,
    };
    return { calls, store };
};

describe('memoizeIdentityLookups', () => {
    it('reuses an identity lookup inside the window and reads again after it', async () => {
        let clock = 0;
        const { calls, store } = countingStore();
        const memo = memoizeIdentityLookups(store, () => clock);
        await memo.findByIdentity(identity);
        await memo.findByIdentity(identity);
        expect(calls.find).toBe(1);
        clock = IDENTITY_LOOKUP_MS + 1;
        await memo.findByIdentity(identity);
        expect(calls.find).toBe(2);
    });

    it('forgets every lookup when a projection is applied', async () => {
        const { calls, store } = countingStore();
        const memo = memoizeIdentityLookups(store, () => 0);
        expect(await memo.findByIdentity(identity)).toEqual({ type: 'missing' });
        await memo.apply({
            eventId: 'remove',
            identity,
            sourceUpdatedAt: 1,
            type: 'remove',
        });
        expect(await memo.findByIdentity(identity)).toEqual({ type: 'tombstone' });
        expect(calls.find).toBe(2);
    });

    it('does not keep a failed lookup', async () => {
        let fail = true;
        const store: AccessProjectionStore = {
            apply: async () => {},
            findByIdentity: async () => {
                if (fail) throw new Error('down');
                return { type: 'missing' };
            },
            findByMerchbaseUserId: async () => null,
        };
        const memo = memoizeIdentityLookups(store, () => 0);
        await expect(memo.findByIdentity(identity)).rejects.toThrow('down');
        fail = false;
        expect(await memo.findByIdentity(identity)).toEqual({ type: 'missing' });
    });
});

describe('memoizePrincipals', () => {
    it('resolves each user once and retries after a failure', async () => {
        let calls = 0;
        const resolve = memoizePrincipals(async ({ merchbaseUserId }) => {
            calls += 1;
            if (calls === 1) throw new Error('down');
            return { id: `sa_${merchbaseUserId}` };
        });
        await expect(resolve({ merchbaseUserId: 'mbu_a' })).rejects.toThrow('down');
        expect(await resolve({ merchbaseUserId: 'mbu_a' })).toEqual({ id: 'sa_mbu_a' });
        expect(await resolve({ merchbaseUserId: 'mbu_a' })).toEqual({ id: 'sa_mbu_a' });
        expect(calls).toBe(2);
    });
});
