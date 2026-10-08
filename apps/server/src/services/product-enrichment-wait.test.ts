import { describe, expect, it, mock } from 'bun:test';
import { createConcurrencyLimit } from './concurrency-limit';
import { waitForProductEnrichment } from './product-enrichment-wait';
import { RetrievalRetryableError } from './retrieval-coordinator';

describe('Product enrichment wait', () => {
    it('waits for a cold generation and returns the generated value', async () => {
        const work = mock(async () => {
            await sleep(20);
            return 'Zombiecorn';
        });

        const value = await waitForProductEnrichment({
            key: uniqueKey(),
            work,
            timeoutMs: 1000,
            label: 'test',
        });

        expect(value).toBe('Zombiecorn');
        expect(work).toHaveBeenCalledTimes(1);
    });

    it('settles a generation slower than the deadline as none and keeps it running', async () => {
        const key = uniqueKey();
        let stored: string | null = null;
        const generation = mock(async () => {
            await sleep(60);
            stored = 'Zombiecorn';
            return stored;
        });

        const first = await waitForProductEnrichment({
            key,
            work: generation,
            timeoutMs: 10,
            label: 'test',
        });
        expect(first).toBeNull();
        expect(stored).toBeNull();

        // The next request joins the still-running job instead of starting another.
        const second = await waitForProductEnrichment({
            key,
            work: generation,
            timeoutMs: 1000,
            label: 'test',
        });
        expect(second).toBe('Zombiecorn');
        expect(generation).toHaveBeenCalledTimes(1);

        // Once finished, a later request reads the stored value.
        const third = await waitForProductEnrichment({
            key,
            work: async () => stored,
            timeoutMs: 1000,
            label: 'test',
        });
        expect(third).toBe('Zombiecorn');
    });

    it('settles a generation failure as none instead of a retryable error', async () => {
        const value = await waitForProductEnrichment({
            key: uniqueKey(),
            work: () => Promise.reject(new Error('provider exploded')),
            timeoutMs: 1000,
            label: 'test',
        });

        expect(value).toBeNull();
    });

    it('still rejects when the caller has gone away', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = waitForProductEnrichment({
            key: uniqueKey(),
            work: () => sleep(20).then(() => 'late'),
            signal: controller.signal,
            timeoutMs: 1000,
            label: 'test',
        });

        await expect(result).rejects.toBeInstanceOf(RetrievalRetryableError);
    });

    it('shares one job across concurrent requests for the same Product', async () => {
        const key = uniqueKey();
        const work = mock(async () => {
            await sleep(20);
            return 'Zombiecorn';
        });

        const values = await Promise.all(
            Array.from({ length: 5 }, () =>
                waitForProductEnrichment({ key, work, timeoutMs: 1000, label: 'test' })
            )
        );

        expect(values).toEqual(new Array(5).fill('Zombiecorn'));
        expect(work).toHaveBeenCalledTimes(1);
    });

    it('honors the generation cap and counts queued time toward the deadline', async () => {
        const slots = createConcurrencyLimit(2);
        let running = 0;
        let peak = 0;
        const generate = (name: string) => () =>
            slots.run(async () => {
                running += 1;
                peak = Math.max(peak, running);
                await sleep(40);
                running -= 1;
                return name;
            });
        const names = ['a', 'b', 'c', 'd', 'e', 'f'];
        const keys = names.map(() => uniqueKey());

        // Wave one (a, b) finishes at ~40ms; queued waves finish at ~80ms and ~120ms, past 60ms.
        const values = await Promise.all(
            names.map((name, index) =>
                waitForProductEnrichment({
                    key: keys[index] as string,
                    work: generate(name),
                    timeoutMs: 60,
                    label: 'test',
                })
            )
        );

        expect(values).toEqual(['a', 'b', null, null, null, null]);
        expect(peak).toBe(2);

        // Queued jobs keep their turn in the background; the next request joins and finishes.
        const retry = await waitForProductEnrichment({
            key: keys[5] as string,
            work: async () => 'duplicate job',
            timeoutMs: 1000,
            label: 'test',
        });
        expect(retry).toBe('f');
        expect(slots.active).toBe(0);
        expect(peak).toBe(2);
    });
});

let keyCounter = 0;
const uniqueKey = () => `test-enrichment:${Date.now()}:${keyCounter++}`;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
