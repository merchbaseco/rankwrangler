import { describe, expect, it, mock } from 'bun:test';
import { pruneJobExecutions } from './prune-job-executions';

describe('job-execution retention', () => {
    it('deletes runs older than fourteen days in bounded batches', async () => {
        const now = new Date('2026-10-27T12:00:00Z');
        const deleteBatch = mock(async () => 10_000);
        const result = await pruneJobExecutions(deleteBatch, now);
        expect(deleteBatch).toHaveBeenCalledTimes(20);
        expect(deleteBatch.mock.calls[0]).toEqual([
            { before: new Date('2026-10-13T12:00:00Z'), batchSize: 10_000 },
        ] as never);
        expect(result).toEqual({ didWork: true, deletedCount: 200_000, reachedDeleteLimit: true });
        expect((await pruneJobExecutions(async () => 0, now)).didWork).toBe(false);
    });
});
