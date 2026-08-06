import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import { runReadOnlyTool } from './tool-result';

describe('RankWrangler MCP error contract', () => {
    it('preserves NOT_FOUND without making it retryable', async () => {
        const log = mock(() => undefined);
        const originalError = console.error;
        console.error = log;
        try {
            const result = await runReadOnlyTool(() => {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Product info not available from Amazon catalog.',
                });
            });

            expect(result).toMatchObject({
                isError: true,
                structuredContent: {
                    error: {
                        code: 'NOT_FOUND',
                        retryable: false,
                    },
                },
            });
        } finally {
            console.error = originalError;
        }
    });

    it('maps temporary unavailability to a retryable neutral error with a hint', async () => {
        const log = mock(() => undefined);
        const originalError = console.error;
        console.error = log;
        try {
            const result = await runReadOnlyTool(() => {
                throw new TRPCError({
                    code: 'TIMEOUT',
                    message: 'Product history is temporarily unavailable. Retry after 17 seconds.',
                });
            });

            expect(result).toMatchObject({
                isError: true,
                structuredContent: {
                    error: {
                        code: 'TEMPORARILY_UNAVAILABLE',
                        retryAfterSeconds: 17,
                        retryable: true,
                    },
                },
            });
            expect(JSON.stringify(result)).not.toContain('Amazon');
            expect(log).toHaveBeenCalledTimes(1);
        } finally {
            console.error = originalError;
        }
    });

    it('maps allowance exhaustion to a retryable rate-limit error with a hint', async () => {
        const log = mock(() => undefined);
        const originalError = console.error;
        console.error = log;
        try {
            const result = await runReadOnlyTool(() => {
                throw new TRPCError({
                    code: 'TOO_MANY_REQUESTS',
                    message: 'Daily limit exceeded. Retry after 123 seconds.',
                });
            });

            expect(result).toMatchObject({
                isError: true,
                structuredContent: {
                    error: {
                        code: 'RATE_LIMITED',
                        retryAfterSeconds: 123,
                        retryable: true,
                    },
                },
            });
        } finally {
            console.error = originalError;
        }
    });
});
