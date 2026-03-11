import { describe, expect, it } from 'bun:test';
import { getServerRuntimeFlags } from './server-runtime.js';

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
