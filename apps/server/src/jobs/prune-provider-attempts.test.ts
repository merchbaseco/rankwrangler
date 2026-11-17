import { describe, expect, it, mock } from 'bun:test';
import { pruneProviderAttempts, pruneProviderAttemptsJob } from './prune-provider-attempts';

describe('pruneProviderAttempts', () => {
    it('deletes seven-day-old attempts in bounded batches', async () => {
        const deleteBatch = mock().mockResolvedValueOnce(10_000).mockResolvedValueOnce(250);
        const deleteKeepaCapacityBatch = mock().mockResolvedValueOnce(40);

        const result = await pruneProviderAttempts({
            deleteBatch,
            deleteKeepaCapacityBatch,
            now: () => new Date('2026-08-09T12:00:00.000Z'),
        });

        expect(deleteBatch).toHaveBeenCalledTimes(2);
        expect(deleteBatch.mock.calls[0]?.[0]).toEqual({
            before: new Date('2026-08-02T12:00:00.000Z'),
            batchSize: 10_000,
        });
        expect(deleteKeepaCapacityBatch.mock.calls).toEqual([
            [{ before: new Date('2026-08-02T12:00:00.000Z'), batchSize: 10_000 }],
        ]);
        expect(result).toEqual({
            didWork: true,
            deletedCount: 10_250,
            keepaCapacityDeletedCount: 40,
            reachedDeleteLimit: false,
        });
    });

    it('reports a table that hit its bounded delete limit', async () => {
        const result = await pruneProviderAttempts({
            deleteBatch: mock().mockResolvedValue(0),
            deleteKeepaCapacityBatch: mock().mockResolvedValue(10_000),
            now: () => new Date('2026-08-09T12:00:00.000Z'),
        });

        expect(result).toMatchObject({
            keepaCapacityDeletedCount: 100_000,
            reachedDeleteLimit: true,
        });
    });

    it('runs once daily', () => {
        expect(pruneProviderAttemptsJob.schedule).toMatchObject({
            type: 'cron',
            cron: '30 2 * * *',
        });
    });
});
