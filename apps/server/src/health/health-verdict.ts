import {
    type FreshnessCheckName,
    type HealthProbe,
    type JobRunnerState,
    judgedFreshnessChecks,
} from '@/health/health-probe';

type HealthCheckName = 'database' | FreshnessCheckName;

export type HealthVerdict =
    | { readonly status: 'ok' }
    | {
          readonly status: 'degraded';
          readonly failing: readonly [HealthCheckName, ...HealthCheckName[]];
      };

export const evaluateHealth = ({
    now,
    jobRunner,
    probe,
}: {
    readonly now: Date;
    readonly jobRunner: JobRunnerState;
    readonly probe: HealthProbe;
}): HealthVerdict => {
    if (probe.database === 'unreachable') {
        return { status: 'degraded', failing: ['database'] };
    }
    const [first, ...rest] = judgedFreshnessChecks(jobRunner)
        .filter(check => !isWithinSlack(probe.freshness[check.name], check.slackMs, now))
        .map(check => check.name);
    return first === undefined
        ? { status: 'ok' }
        : { status: 'degraded', failing: [first, ...rest] };
};

const isWithinSlack = (
    earliestDueAt: Date | 'nothing-due' | undefined,
    slackMs: number,
    now: Date
) => {
    if (earliestDueAt === undefined) {
        return false;
    }
    if (earliestDueAt === 'nothing-due') {
        return true;
    }
    return now.getTime() - earliestDueAt.getTime() <= slackMs;
};
