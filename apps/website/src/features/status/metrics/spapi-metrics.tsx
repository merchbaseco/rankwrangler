import { jobFamilies } from './job-run-filters';
import { JobRunsSection } from './job-runs-section';
import { MetricKpiGroup } from './metric-kpi-group';
import { MetricsState } from './metrics-state';
import { RateLimiterGrid } from './rate-limiter-grid';
import { RefreshPolicyGrid } from './refresh-policy-grid';
import { statTile } from './stat-tiles';
import { useAdminStats } from './use-admin-stats';

export const SpApiMetrics = () => {
    const statsQuery = useAdminStats();

    if (!statsQuery.data) {
        return <MetricsState error={Boolean(statsQuery.error)} label="SP-API metrics" />;
    }

    const { spApiOperationRateLimiterStats, spApiRefreshPolicyBuckets, stats, timeDomainLabel } =
        statsQuery.data;
    const spApiLabels = new Set(Object.values(jobFamilies.spapi.statLabels));

    return (
        <div className="flex flex-col gap-4">
            <MetricKpiGroup
                tiles={stats
                    .filter(stat => spApiLabels.has(stat.label))
                    .map(stat => statTile(stat, timeDomainLabel))}
            />
            <RefreshPolicyGrid buckets={spApiRefreshPolicyBuckets} title="SP-API refresh" />
            <RateLimiterGrid stats={spApiOperationRateLimiterStats} />
            <JobRunsSection jobNames={jobFamilies.spapi.jobNames} />
        </div>
    );
};
