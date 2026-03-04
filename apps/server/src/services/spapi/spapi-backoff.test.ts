import { describe, expect, it } from 'bun:test';
import {
    createSpApiHttpError,
    getExponentialBackoffDelayMs,
    isRetryableSpApiError,
    runWithSpApiBackoff,
    SpApiBackoffError,
} from '@/services/spapi/spapi-backoff.js';

describe('getExponentialBackoffDelayMs', () => {
    it('doubles delays and caps at max delay', () => {
        expect(
            getExponentialBackoffDelayMs({
                attempt: 0,
                initialDelayMs: 1000,
                maxDelayMs: 30000,
            })
        ).toBe(1000);
        expect(
            getExponentialBackoffDelayMs({
                attempt: 1,
                initialDelayMs: 1000,
                maxDelayMs: 30000,
            })
        ).toBe(2000);
        expect(
            getExponentialBackoffDelayMs({
                attempt: 6,
                initialDelayMs: 1000,
                maxDelayMs: 30000,
            })
        ).toBe(30000);
    });
});

describe('isRetryableSpApiError', () => {
    it('classifies retryable HTTP statuses', () => {
        expect(isRetryableSpApiError(createSpApiHttpError('Too Many Requests', 429))).toBeTrue();
        expect(isRetryableSpApiError(createSpApiHttpError('Bad Gateway', 502))).toBeTrue();
        expect(isRetryableSpApiError(createSpApiHttpError('Bad Request', 400))).toBeFalse();
    });

    it('classifies retryable network and limiter errors', () => {
        expect(
            isRetryableSpApiError(
                new Error('Rate limit exceed error: This job has been dropped by Bottleneck')
            )
        ).toBeTrue();

        const networkError = new Error('connect failed') as Error & { code: string };
        networkError.code = 'ECONNRESET';
        expect(isRetryableSpApiError(networkError)).toBeTrue();
    });
});

describe('runWithSpApiBackoff', () => {
    it('retries retryable failures and eventually succeeds', async () => {
        let attempts = 0;
        const result = await runWithSpApiBackoff({
            operation: 'test op',
            maxAttempts: 3,
            initialDelayMs: 1,
            maxDelayMs: 2,
            run: async () => {
                attempts += 1;
                if (attempts < 3) {
                    throw createSpApiHttpError('Too Many Requests', 429);
                }

                return 'ok';
            },
        });

        expect(result).toBe('ok');
        expect(attempts).toBe(3);
    });

    it('throws immediately for non-retryable failures', async () => {
        let attempts = 0;
        await expect(
            runWithSpApiBackoff({
                operation: 'test op',
                maxAttempts: 5,
                initialDelayMs: 1,
                maxDelayMs: 2,
                run: async () => {
                    attempts += 1;
                    throw createSpApiHttpError('Bad Request', 400);
                },
            })
        ).rejects.toThrow('[SP-API] test op failed after 1 attempt: Bad Request');
        expect(attempts).toBe(1);
    });

    it('exposes retryability metadata on final errors', async () => {
        const failure = await runWithSpApiBackoff({
            operation: 'test op',
            maxAttempts: 2,
            initialDelayMs: 1,
            maxDelayMs: 2,
            run: async () => {
                throw createSpApiHttpError('Too Many Requests', 429);
            },
        }).catch(error => error);

        expect(failure).toBeInstanceOf(SpApiBackoffError);
        expect((failure as SpApiBackoffError).retryable).toBeTrue();
        expect((failure as SpApiBackoffError).attempts).toBe(2);
    });
});
