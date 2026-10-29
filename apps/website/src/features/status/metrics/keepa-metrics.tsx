import { CollectionStatusSection } from './collection-status-section';
import { jobFamilies } from './job-run-filters';
import { JobRunsSection } from './job-runs-section';
import { MetricKpiGroup } from './metric-kpi-group';
import { MetricsState } from './metrics-state';
import { RefreshPolicyGrid } from './refresh-policy-grid';
import { statTile } from './stat-tiles';
import { useAdminStats } from './use-admin-stats';
import { useKeepaStatus } from './use-keepa-status';

export const KeepaMetrics = () => {
    const statsQuery = useAdminStats();
    const keepaStatus = useKeepaStatus();

    if (!statsQuery.data) {
        return <MetricsState error={Boolean(statsQuery.error)} label="Keepa metrics" />;
    }

    const { keepaMerchCoverage, keepaRefreshPolicyBuckets, stats, timeDomainLabel } =
        statsQuery.data;
    const keepaLabels = new Set(Object.values(jobFamilies.keepa.statLabels));
    const autoRefresh = keepaRefreshPolicyBuckets
        .filter(bucket => bucket.isAutoRefresh)
        .reduce((total, bucket) => total + bucket.count, 0);

    return (
        <div className="flex flex-col gap-4">
            <MetricKpiGroup
                tiles={stats
                    .filter(stat => keepaLabels.has(stat.label))
                    .map(stat => statTile(stat, timeDomainLabel, statHelp[stat.label]))}
            />
            <MetricKpiGroup
                tiles={[
                    {
                        help: 'ASINs waiting in the Keepa refresh queue right now.',
                        label: 'Queued',
                        value: keepaStatus.data?.queue.totalQueued ?? null,
                    },
                    {
                        help: 'Merch Products currently eligible for automatic Keepa refresh.',
                        label: 'Auto refresh',
                        tone: 'success',
                        value: autoRefresh,
                    },
                    {
                        help: 'Unique Merch Products in the catalog.',
                        label: 'Merch Products',
                        value: keepaMerchCoverage.totalMerchProducts,
                    },
                    {
                        help: 'Merch Products with at least one successful Keepa import.',
                        label: 'With Keepa',
                        tone: 'success',
                        value: keepaMerchCoverage.merchProductsWithKeepaData,
                    },
                    {
                        help: 'Merch Products that have never had a successful Keepa import.',
                        label: 'Without Keepa',
                        tone: 'danger',
                        value: keepaMerchCoverage.merchProductsWithoutKeepaData,
                    },
                ]}
            />
            <CollectionStatusSection />
            <RefreshPolicyGrid buckets={keepaRefreshPolicyBuckets} title="Keepa refresh" />
            <JobRunsSection jobNames={jobFamilies.keepa.jobNames} />
        </div>
    );
};

const statHelp: Readonly<Record<string, string>> = {
    'Job Failures': 'Keepa fetch or scheduled enqueue jobs that ended failed.',
    'Job Successes': 'Keepa fetch or scheduled enqueue jobs that succeeded.',
    'Keepa Fetches': 'Keepa API call attempts, from Keepa import rows.',
};
