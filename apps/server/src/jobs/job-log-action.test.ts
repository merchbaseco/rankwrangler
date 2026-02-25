import { describe, expect, it } from 'bun:test';
import { getJobLogAction, getJobLogLabel } from './job-log-action.js';

describe('job-log-action', () => {
    it('maps known job names to helpful action keys and labels', () => {
        expect(getJobLogAction('process-spapi-sync-queue', 'completed')).toBe(
            'job.product-sync.completed'
        );
        expect(getJobLogLabel('process-spapi-sync-queue')).toBe('Product sync batch');
    });

    it('falls back for unknown job names', () => {
        expect(getJobLogAction('totally-unknown-job', 'failed')).toBe(
            'job.background-task.failed'
        );
        expect(getJobLogLabel('totally-unknown-job')).toBe('Background task');
    });
});
