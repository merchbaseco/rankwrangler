import { describe, expect, it, mock } from 'bun:test';
import { type KeepaCapacity, KeepaCapacityDeferredError } from './keepa-capacity-types';
import { reserveKeepaCapacity } from './keepa-interactive-reserve';

const capacityDeferring = (reasons: string[]) => {
    const reserve = mock(async () => {
        const reason = reasons.shift();
        if (reason) throw new KeepaCapacityDeferredError(reason, new Date());
    });
    const capacity: KeepaCapacity = {
        enqueue: async () => 'attempt',
        cancel: async () => undefined,
        reserve,
        settle: async () => undefined,
    };
    return { capacity, reserve };
};

const clock = () => {
    let at = 0;
    return { now: () => at, sleep: async (ms: number) => void (at += ms) };
};

describe('reserveKeepaCapacity', () => {
    it('waits out a short bucket for interactive work', async () => {
        const { capacity, reserve } = capacityDeferring(['bucket', 'bucket']);
        const refreshBucket = mock(async () => undefined);
        await reserveKeepaCapacity({
            capacity,
            attemptId: 'attempt',
            workClass: 'interactive',
            refreshBucket,
            ...clock(),
        });
        expect(reserve).toHaveBeenCalledTimes(3);
        expect(refreshBucket).toHaveBeenCalledTimes(2);
    });
    it('gives up after the interactive wait', async () => {
        const { capacity } = capacityDeferring(Array(100).fill('bucket'));
        await expect(
            reserveKeepaCapacity({
                capacity,
                attemptId: 'attempt',
                workClass: 'interactive',
                refreshBucket: async () => undefined,
                ...clock(),
            })
        ).rejects.toThrow('bucket');
    });
    it('defers background work and other reasons immediately', async () => {
        for (const [workClass, reason] of [
            ['history', 'bucket'],
            ['interactive', 'unknown-pilot-cap'],
        ] as const) {
            const { capacity, reserve } = capacityDeferring([reason]);
            await expect(
                reserveKeepaCapacity({
                    capacity,
                    attemptId: 'attempt',
                    workClass,
                    refreshBucket: async () => undefined,
                    ...clock(),
                })
            ).rejects.toThrow(reason);
            expect(reserve).toHaveBeenCalledTimes(1);
        }
    });
});
