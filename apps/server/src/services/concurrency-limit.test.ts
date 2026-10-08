import { describe, expect, it } from 'bun:test';
import { createConcurrencyLimit } from './concurrency-limit';

describe('concurrency limit', () => {
    it('runs at most the cap at once and starts queued jobs in FIFO order', async () => {
        const limit = createConcurrencyLimit(3);
        const started: number[] = [];
        let running = 0;
        let peak = 0;

        await Promise.all(
            Array.from({ length: 10 }, (_, index) =>
                limit.run(async () => {
                    started.push(index);
                    running += 1;
                    peak = Math.max(peak, running);
                    await sleep(5);
                    running -= 1;
                })
            )
        );

        expect(peak).toBe(3);
        expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(limit.active).toBe(0);
        expect(limit.queued).toBe(0);
    });

    it('releases the slot when a job fails', async () => {
        const limit = createConcurrencyLimit(1);

        await expect(limit.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

        expect(await limit.run(async () => 'next')).toBe('next');
        expect(limit.active).toBe(0);
    });

    it('rejects a non-positive cap', () => {
        expect(() => createConcurrencyLimit(0)).toThrow();
    });
});

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
