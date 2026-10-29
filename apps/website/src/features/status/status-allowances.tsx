import type { RouterOutputs } from '@/lib/trpc';
import { jobFamilies } from './metrics/job-run-filters';
import { formatCount } from './metrics/metric-format';
import { MetricKpiGroup } from './metrics/metric-kpi-group';
import { fraction, keepaWorkLabels, operationLabel, type SystemStatus } from './status-model';
import {
    Headline,
    Legend,
    type Segment,
    type SeriesTone,
    SegmentedBar,
    StatusCard,
    StatusSection,
} from './status-panel';

type AdminStats = RouterOutputs['api']['app']['getAdminStats'];

const breakdownTones: readonly SeriesTone[] = ['current', 'accent', 'pending', 'due', 'idle'];

/**
 * Provider usage against its allowance, one card per provider in the same shape: the share of
 * the last hour's allowance used, what it went to, errors, and the last day's jobs. Keepa's
 * allowance is its hourly token refill; SP-API's is its rate limiters' combined hourly pace.
 */
export const StatusAllowances = ({
    calls,
    keepa,
    stats,
}: {
    calls: SystemStatus['calls'];
    keepa: SystemStatus['keepa'];
    stats: AdminStats | undefined;
}) => {
    const keepaSpent = keepa.spentLastHour.reduce((sum, row) => sum + row.tokens, 0);
    const keepaSegments = toSegments(
        keepa.spentLastHour.map(row => ({
            key: row.workClass,
            label: keepaWorkLabels[row.workClass] ?? row.workClass,
            value: Math.round(row.tokens),
        }))
    );
    const spApiCalls = calls.filter(row => row.provider === 'spapi');
    // The limiters' combined pace is what SP-API lets this account spend in an hour.
    const spApiAllowance = Math.round(
        (stats?.spApiOperationRateLimiterStats ?? []).reduce(
            (sum, operation) => sum + operation.effectiveRps,
            0
        ) * 3600
    );
    const spApiUsed = spApiCalls.reduce((sum, row) => sum + row.calls1h, 0);
    const spApiSegments = toSegments(
        spApiCalls.map(row => ({
            key: row.operation,
            label: operationLabel(row.operation),
            value: row.calls1h,
        }))
    );
    const spApiOperations = stats?.spApiOperationRateLimiterStats.length ?? 0;
    const errors = (provider: string) =>
        calls
            .filter(row => row.provider === provider)
            .reduce((sum, row) => sum + row.errors24h, 0);

    return (
        <StatusSection
            caption="Last hour against each provider's hourly allowance"
            title="API usage"
        >
            <div className="status-pair">
                <AllowanceCard
                    aside={keepaAside(keepa)}
                    allowance={keepa.capacity}
                    errors={errors('keepa')}
                    jobs={jobTiles(stats, 'keepa')}
                    segments={keepaSegments}
                    title="Keepa"
                    unit="Tokens"
                    used={Math.round(keepaSpent)}
                />
                <AllowanceCard
                    aside={`${formatCount(spApiOperations)} rate-limited operations`}
                    allowance={spApiAllowance || null}
                    errors={errors('spapi')}
                    jobs={jobTiles(stats, 'spapi')}
                    segments={spApiSegments}
                    title="SP-API"
                    unit="Calls"
                    used={spApiUsed}
                />
            </div>
        </StatusSection>
    );
};

/** One provider: share of the hour's allowance used, what it went to, errors and jobs. */
const AllowanceCard = ({
    allowance,
    aside,
    errors,
    jobs,
    segments,
    title,
    unit,
    used,
}: {
    allowance: number | null;
    aside: string;
    errors: number;
    jobs: ReturnType<typeof jobTiles>;
    segments: readonly Segment[];
    title: string;
    unit: string;
    used: number;
}) => (
    <StatusCard aside={aside} title={title}>
        <Headline
            figures={[
                {
                    label: 'Allowance used · 1h',
                    suffix: '%',
                    value: allowance === null ? null : Math.round(fraction(used, allowance) * 100),
                },
                { label: `${unit} · 1h`, of: allowance, value: used },
                { label: 'Errors · 24h', value: errors },
            ]}
        />
        <SegmentedBar
            label={`${title} usage in the last hour`}
            segments={segments}
            size="sm"
            total={allowance}
        />
        <Legend segments={segments} />
        <MetricKpiGroup tiles={jobs} />
    </StatusCard>
);

const keepaAside = (keepa: SystemStatus['keepa']) => {
    if (keepa.refillRate === null) {
        return 'Awaiting first observation';
    }
    const bucket = keepa.tokensLeft === null ? '—' : formatCount(Math.round(keepa.tokensLeft));
    return `${bucket} in bucket · ${formatCount(keepa.refillRate)}/min refill`;
};

const toSegments = (
    rows: ReadonlyArray<{ readonly key: string; readonly label: string; readonly value: number }>
): Segment[] =>
    rows.map((row, index) => ({
        ...row,
        tone: breakdownTones[index % breakdownTones.length] ?? 'idle',
    }));

/** The provider's jobs over the last day, as the same three tiles for both providers. */
const jobTiles = (stats: AdminStats | undefined, family: 'keepa' | 'spapi') => {
    const labels = jobFamilies[family].statLabels;
    const total = (label: string) =>
        stats?.stats.find(stat => stat.label === label)?.total ?? null;
    const series = (label: string) => stats?.stats.find(stat => stat.label === label)?.buckets;
    return [
        { buckets: series(labels.all), label: 'Jobs · 24h', value: total(labels.all) },
        {
            buckets: series(labels.success),
            label: 'Succeeded',
            tone: 'success' as const,
            value: total(labels.success),
        },
        {
            buckets: series(labels.failed),
            label: 'Failed',
            tone: 'danger' as const,
            value: total(labels.failed),
        },
    ];
};
