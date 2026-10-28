import {
    type KeepaCapacity,
    KeepaCapacityDeferredError,
    type KeepaWorkClass,
} from './keepa-capacity-types';

const INTERACTIVE_RESERVE_WAIT_MS = 90 * 1000;
const INTERACTIVE_RESERVE_RETRY_MS = 5 * 1000;

// Someone is waiting on interactive work, so a short bucket is waited out here (the attempt stays
// open and background work yields) instead of failing back to a caller who would retry minutes later.
export const reserveKeepaCapacity = async ({
    capacity,
    attemptId,
    workClass,
    refreshBucket,
    sleep = defaultSleep,
    now = Date.now,
}: {
    capacity: KeepaCapacity;
    attemptId: string;
    workClass: KeepaWorkClass;
    refreshBucket: () => Promise<unknown>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}) => {
    const deadline = now() + INTERACTIVE_RESERVE_WAIT_MS;
    for (;;) {
        try {
            return await capacity.reserve(attemptId);
        } catch (error) {
            if (
                workClass !== 'interactive' ||
                !(error instanceof KeepaCapacityDeferredError) ||
                error.reason !== 'bucket' ||
                now() + INTERACTIVE_RESERVE_RETRY_MS > deadline
            ) {
                throw error;
            }
        }
        await sleep(INTERACTIVE_RESERVE_RETRY_MS);
        await refreshBucket();
    }
};

const defaultSleep = async (ms: number) => {
    await new Promise(resolve => setTimeout(resolve, ms));
};
