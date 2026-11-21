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

    it('returns a retry followup when a dropped-trial depth pass fails transiently', async () => {
        const retryAt = new Date('2026-11-21T18:00:00Z');
        const stop = mock((_input: unknown) => Promise.resolve(retryAt));
        const result = await scanKeywordPage('target-2', {
            claim: mock(() =>
                Promise.resolve({
                    target: { enabled: false, tracking: 'dropped' },
                    pass: { id: 'pass-2', claimToken: 'claim-2', nextPage: 2, nextPageToken: 'p3' },
                    scope: { kind: 'keyword', term: 'teacher shirt' },
                    marketplaceId: 'ATVPDKIKX0DER',
                })
            ),
            reserve: mock(() => Promise.resolve('attempt-2')),
            discover: mock(() => Promise.reject(new Error('transient SP-API 503'))),
            persist: mock(),
            checkpoint: mock(),
            stop,
        } as unknown as Parameters<typeof scanKeywordPage>[1]);
        expect(result).toEqual({
            kind: 'retry',
            didWork: false,
            term: 'teacher shirt',
            page: 2,
            retryAt,
        });
        expect(stop.mock.calls[0]?.[0]).toMatchObject({
            passId: 'pass-2',
            claimToken: 'claim-2',
            attemptId: 'attempt-2',
            reason: 'failure',
        });
    });
});
