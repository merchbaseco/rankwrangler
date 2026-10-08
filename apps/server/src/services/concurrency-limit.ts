export interface ConcurrencyLimit {
    run: <T>(work: () => Promise<T>) => Promise<T>;
    readonly active: number;
    readonly queued: number;
}

/** Runs at most `max` jobs at once; later jobs wait in FIFO order for a free slot. */
export const createConcurrencyLimit = (max: number): ConcurrencyLimit => {
    if (!Number.isInteger(max) || max < 1) {
        throw new Error(`Concurrency limit must be a positive integer (received ${max}).`);
    }
    let active = 0;
    const waiting: Array<() => void> = [];

    const acquire = async () => {
        if (active < max) {
            active += 1;
            return;
        }
        // The releasing job hands its slot directly to the next waiter, so `active` is unchanged.
        await new Promise<void>(resolve => waiting.push(resolve));
    };

    const release = () => {
        const next = waiting.shift();
        if (next) {
            next();
            return;
        }
        active -= 1;
    };

    return {
        run: async work => {
            await acquire();
            try {
                return await work();
            } finally {
                release();
            }
        },
        get active() {
            return active;
        },
        get queued() {
            return waiting.length;
        },
    };
};
