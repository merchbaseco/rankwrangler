import { describe, expect, it, mock } from 'bun:test';
import { pruneProviderAttempts, pruneProviderAttemptsJob } from './prune-provider-attempts';

describe('pruneProviderAttempts', () => {
    it('deletes seven-day-old attempts in bounded batches', async () => {
        const deleteBatch = mock().mockResolvedValueOnce(10_000).mockResolvedValueOnce(250);

        const result = await pruneProviderAttempts({
            deleteBatch,
            now: () => new Date('2026-08-09T12:00:00.000Z'),
        });

        expect(deleteBatch).toHaveBeenCalledTimes(2);
        expect(deleteBatch.mock.calls[0]?.[0]).toEqual({
            before: new Date('2026-08-02T12:00:00.000Z'),
            batchSize: 10_000,
        });
        expect(result).toEqual({
            didWork: true,
            deletedCount: 10_250,
            reachedDeleteLimit: false,
        });
    });

    it('runs once daily', () => {
        expect(pruneProviderAttemptsJob.schedule).toMatchObject({
            type: 'cron',
            cron: '30 2 * * *',
        });
    });
});
