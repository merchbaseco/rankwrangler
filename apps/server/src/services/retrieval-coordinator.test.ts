import { describe, expect, it } from 'bun:test';
import {
    coordinateRetrieval,
    RetrievalRetryableError,
    startDetachedRetrieval,
} from './retrieval-coordinator.js';

describe('shared retrieval coordinator', () => {
    it('coalesces equivalent concurrent retrievals into one work promise', async () => {
        let resolveWork: ((value: string) => void) | undefined;
        let workCalls = 0;
        const work = async () => {
            workCalls += 1;
            return await new Promise<string>(resolve => {
                resolveWork = resolve;
            });
        };

        const first = coordinateRetrieval({
            key: 'product:ATVPDKIKX0DER:B012345678:history',
            work,
        });
        const second = coordinateRetrieval({
            key: 'product:ATVPDKIKX0DER:B012345678:history',
            work,
        });
        await waitForWorkStart();

        expect(workCalls).toBe(1);

        resolveWork?.('completed');
        await expect(Promise.all([first, second])).resolves.toEqual(['completed', 'completed']);
    });

    it('detaches an aborted caller while shared work continues for another caller', async () => {
        let resolveWork: ((value: string) => void) | undefined;
        const controller = new AbortController();
        let workCalls = 0;
        const work = async () => {
            workCalls += 1;
            return await new Promise<string>(resolve => {
                resolveWork = resolve;
            });
        };

        const detached = coordinateRetrieval({
            key: 'product:ATVPDKIKX0DER:B012345678:history-abort',
            work,
            signal: controller.signal,
        });
        await waitForWorkStart();
        controller.abort();

        await expect(detached).rejects.toMatchObject({
            name: 'RetrievalRetryableError',
            reason: 'caller_detached',
        });

        const joined = coordinateRetrieval({
            key: 'product:ATVPDKIKX0DER:B012345678:history-abort',
            work,
        });
        resolveWork?.('completed');

        await expect(joined).resolves.toBe('completed');
        expect(workCalls).toBe(1);
    });

    it('detaches a timed-out caller without cancelling durable work', async () => {
        let resolveWork: ((value: string) => void) | undefined;
        let workCalls = 0;
        const work = async () => {
            workCalls += 1;
            return await new Promise<string>(resolve => {
                resolveWork = resolve;
            });
        };

        const timedOut = coordinateRetrieval({
            key: 'product:ATVPDKIKX0DER:B012345678:history-timeout',
            work,
            timeoutMs: 1,
        });
        await expect(timedOut).rejects.toBeInstanceOf(RetrievalRetryableError);

        const joined = coordinateRetrieval({
            key: 'product:ATVPDKIKX0DER:B012345678:history-timeout',
            work,
        });
        resolveWork?.('completed');

        await expect(joined).resolves.toBe('completed');
        expect(workCalls).toBe(1);
    });

    it('starts detached work once and lets a waiting caller join it', async () => {
        let resolveWork: ((value: string) => void) | undefined;
        let workCalls = 0;
        const key = 'product-short-name:ATVPDKIKX0DER:B012345678:fingerprint';
        const work = async () => {
            workCalls += 1;
            return await new Promise<string>(resolve => {
                resolveWork = resolve;
            });
        };
        const onError = () => undefined;

        expect(startDetachedRetrieval({ key, work, onError })).toBe(true);
        expect(startDetachedRetrieval({ key, work, onError })).toBe(false);
        const waiting = coordinateRetrieval({ key, work });
        await waitForWorkStart();

        expect(workCalls).toBe(1);
        resolveWork?.('Zombiecorn');
        await expect(waiting).resolves.toBe('Zombiecorn');
        expect(startDetachedRetrieval({ key, work, onError })).toBe(true);
    });

    it('reports detached work failures without rejecting the starter', async () => {
        const failure = new Error('provider down');
        const errors: unknown[] = [];

        startDetachedRetrieval({
            key: 'product-cutout:ATVPDKIKX0DER:B012345678:fingerprint',
            work: () => Promise.reject(failure),
            onError: error => errors.push(error),
        });
        await waitForWorkStart();
        await waitForWorkStart();

        expect(errors).toEqual([failure]);
    });
});

const waitForWorkStart = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
};
