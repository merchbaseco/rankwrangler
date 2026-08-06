import { describe, expect, it } from 'bun:test';
import { coordinateRetrieval, RetrievalRetryableError } from './retrieval-coordinator.js';

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
});

const waitForWorkStart = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
};
