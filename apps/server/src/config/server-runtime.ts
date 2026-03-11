export type ServerRuntimeFlags = {
    jobRunnerDisabled: boolean;
    shouldStartJobRunner: boolean;
    jobRunnerStatus: string;
};

export const getServerRuntimeFlags = ({
    disableServerJobRunner,
}: {
    disableServerJobRunner: boolean;
}): ServerRuntimeFlags => {
    if (disableServerJobRunner) {
        return {
            jobRunnerDisabled: true,
            shouldStartJobRunner: false,
            jobRunnerStatus: 'Disabled (DISABLE_SERVER_JOB_RUNNER=true)',
        };
    }

    return {
        jobRunnerDisabled: false,
        shouldStartJobRunner: true,
        jobRunnerStatus: 'Enabled',
    };
};
