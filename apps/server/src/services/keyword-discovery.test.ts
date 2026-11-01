import { describe, expect, it, mock } from 'bun:test';
import { SyncPausedError } from './discovery-types';
import { scanKeywordPage } from './keyword-discovery';

describe('scanKeywordPage', () => {
    it('keeps the page and reports paused when sync pauses while the page waits its turn', async () => {
        const stop = mock((_input: unknown) => Promise.resolve(new Date()));
        const checkpoint = mock(() => Promise.reject(new Error('not reached')));
        const result = await scanKeywordPage('target-1', {
            claim: mock(() =>
                Promise.resolve({
                    pass: { id: 'pass-1', claimToken: 'claim-1', nextPage: 2, nextPageToken: 'p3' },
                    scope: { kind: 'keyword', term: 'fishing shirt' },
                    marketplaceId: 'ATVPDKIKX0DER',
                })
            ),
            reserve: mock(() => Promise.resolve('attempt-1')),
            discover: mock(() => Promise.reject(new SyncPausedError())),
            persist: mock(),
            checkpoint,
            stop,
        } as unknown as Parameters<typeof scanKeywordPage>[1]);
        expect(result).toEqual({ kind: 'paused', didWork: false, term: 'fishing shirt', page: 2 });
        expect(checkpoint).not.toHaveBeenCalled();
        expect(stop.mock.calls[0]?.[0]).toMatchObject({
            passId: 'pass-1',
            claimToken: 'claim-1',
            attemptId: 'attempt-1',
            reason: 'budget',
        });
    });
});
