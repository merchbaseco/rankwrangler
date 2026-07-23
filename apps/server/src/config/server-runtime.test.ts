import { describe, expect, it } from 'bun:test';
import {
    getProductHistoryOperationsStatus,
    getServerRuntimeFlags,
} from './server-runtime.js';

describe('getServerRuntimeFlags', () => {
    it('enables the job runner when the toggle is false', () => {
        expect(
            getServerRuntimeFlags({
                disableServerJobRunner: false,
            })
        ).toEqual({
            jobRunnerDisabled: false,
            shouldStartJobRunner: true,
            jobRunnerStatus: 'Enabled',
        });
    });

    it('disables the job runner when the toggle is true', () => {
        expect(
            getServerRuntimeFlags({
                disableServerJobRunner: true,
            })
        ).toEqual({
            jobRunnerDisabled: true,
            shouldStartJobRunner: false,
            jobRunnerStatus: 'Disabled (DISABLE_SERVER_JOB_RUNNER=true)',
        });
    });
});

describe('getProductHistoryOperationsStatus', () => {
    it('reports recovery when workers are enabled', () => {
        expect(getProductHistoryOperationsStatus(true, 3)).toBe(
            'Enabled (3 stale receipts redispatched)'
        );
    });

    it('reports disabled when the job runner is disabled', () => {
        expect(getProductHistoryOperationsStatus(false, 0)).toBe(
            'Disabled at runtime (job runner disabled)'
        );
    });
});
