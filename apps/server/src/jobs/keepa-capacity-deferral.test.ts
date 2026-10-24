import { describe, expect, it, mock } from 'bun:test';
import { KeepaCapacityDeferredError } from '@/services/providers/keepa/keepa-capacity-types';
import { fetchKeepaHistoryForAsin } from './fetch-keepa-history-for-asin';

describe('history capacity deferral', () => {
    it('retains work at its retry time without recording a failure or successful fetch', async () => {
        const retryAt = new Date('2026-10-23T13:00:00Z');
        const defer = mock(() => Promise.resolve());
        const remove = mock(() => Promise.resolve());
        const fail = mock(() => Promise.resolve(null));
        const log = mock(() => Promise.resolve());
        const input = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B0TEST0001' };
        await fetchKeepaHistoryForAsin(input, {
            deferKeepaHistory: defer,
            createEventLogSafe: log,
            getKeepaHistoryDaysForAsin: () => Promise.resolve(30),
            getKeepaHistoryRefreshQueueItem: () =>
                Promise.resolve({
                    ...input,
                    id: 'queue',
                    attemptCount: 0,
                    nextAttemptAt: new Date(),
                    createdAt: new Date(),
                }),
            shouldKeepaHistoryRefreshAsin: () =>
                Promise.resolve({ shouldRefresh: true, reason: 'stale_product' }),
            loadKeepaProductHistory: () =>
                Promise.reject(new KeepaCapacityDeferredError('rolling-share', retryAt)),
            recordKeepaHistoryRefreshFailure: fail,
            removeKeepaHistoryRefreshQueueItem: remove,
        });
        expect(defer.mock.calls).toEqual([[{ ...input, retryAt }]]);
        expect(remove).not.toHaveBeenCalled();
        expect(fail).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
    });
});
