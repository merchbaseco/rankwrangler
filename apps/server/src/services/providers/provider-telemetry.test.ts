import { describe, expect, it, mock, spyOn } from 'bun:test';
import { captureProviderAttempt, type ProviderAttemptRecord } from './provider-telemetry';

describe('captureProviderAttempt', () => {
    it('records a successful physical request', async () => {
        const attempts: ProviderAttemptRecord[] = [];
        const now = mock(() => 1000);
        now.mockReturnValueOnce(1000).mockReturnValueOnce(1025);

        const result = await captureProviderAttempt(
            { provider: 'keepa', operation: 'keepa.product' },
            async () => new Response('{}', { status: 200 }),
            {
                now,
                record: attempt => {
                    attempts.push(attempt);
                    return Promise.resolve();
                },
            }
        );

        expect(result.status).toBe(200);
        expect(attempts).toEqual([
            {
                provider: 'keepa',
                operation: 'keepa.product',
                attemptedAt: new Date(1000),
                statusCode: 200,
                isError: false,
                latencyMs: 25,
            },
        ]);
    });

    it('records an error and preserves the original failure', async () => {
        const originalError = Object.assign(new Error('provider failed'), { status: 503 });
        const attempts: ProviderAttemptRecord[] = [];
        let nowMs = 2000;

        await expect(
            captureProviderAttempt(
                { provider: 'spapi', operation: 'spapi.catalog.search' },
                () => {
                    nowMs = 2040;
                    return Promise.reject(originalError);
                },
                {
                    now: () => nowMs,
                    record: attempt => {
                        attempts.push(attempt);
                        return Promise.resolve();
                    },
                }
            )
        ).rejects.toBe(originalError);

        expect(attempts[0]).toMatchObject({
            statusCode: 503,
            isError: true,
            latencyMs: 40,
        });
    });

    it('does not change provider outcomes when telemetry storage fails', async () => {
        const warning = spyOn(console, 'warn').mockImplementation(() => {});
        const result = await captureProviderAttempt(
            { provider: 'spapi', operation: 'spapi.reports.get' },
            () => Promise.resolve('provider-result'),
            {
                record: () => Promise.reject(new Error('database unavailable')),
            }
        );

        expect(result).toBe('provider-result');
        expect(warning).toHaveBeenCalledTimes(1);
        warning.mockRestore();
    });

    it('preserves the provider error when telemetry storage also fails', async () => {
        const warning = spyOn(console, 'warn').mockImplementation(() => {});
        const providerError = new Error('provider unavailable');

        await expect(
            captureProviderAttempt(
                { provider: 'keepa', operation: 'keepa.token' },
                () => Promise.reject(providerError),
                { record: () => Promise.reject(new Error('database unavailable')) }
            )
        ).rejects.toBe(providerError);

        expect(warning).toHaveBeenCalledTimes(1);
        warning.mockRestore();
    });
});
