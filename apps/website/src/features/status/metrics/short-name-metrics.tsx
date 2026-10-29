import { GenerationMetrics } from './generation-metrics';
import { formatCount } from './metric-format';
import { MetricsState } from './metrics-state';
import { useShortNameMetrics } from './use-short-name-metrics';

export const ShortNameMetrics = () => {
    const query = useShortNameMetrics();

    if (!query.data) {
        return <MetricsState error={Boolean(query.error)} label="Short-name metrics" />;
    }

    const { activity, coverage, hourly, recent } = query.data;

    return (
        <GenerationMetrics
            activity={[
                { label: 'Completed · 24h', tone: 'success', value: activity.generated },
                { label: 'Abstained · 24h', value: activity.abstained },
                { label: 'Failed · 24h', tone: 'danger', value: activity.failed },
                {
                    detail: `${formatCount(activity.geminiErrors)} errors`,
                    label: 'Gemini calls · 24h',
                    value: activity.geminiCalls,
                },
                {
                    detail: `${formatCount(activity.typeSafeErrors)} errors`,
                    label: 'Jev calls · 24h',
                    value: activity.typeSafeCalls,
                },
            ]}
            coverage={[
                { label: 'Eligible Products', value: coverage.eligible },
                { label: 'Current', detail: 'Including no name', value: coverage.ready },
                { label: 'Never requested', value: coverage.neverRequested },
                { label: 'Needs regeneration', value: coverage.needsRegeneration },
                { label: 'Pending or failed', value: coverage.pending + coverage.error },
            ]}
            generatedLabel="Completed"
            hourly={hourly}
            note="Rows exist only once a short name is requested. A changed title or image is regenerated on the next request."
            recent={recent.map(row => ({
                asin: row.asin,
                occurredAt: row.occurredAt,
                ...shortNameOutcome(row.status, row.outcome),
            }))}
        />
    );
};

const shortNameOutcome = (status: string, outcome: string | null) => {
    if (status === 'failed') {
        return { label: 'Failed', tone: 'danger' } as const;
    }
    return outcome === 'abstained'
        ? ({ label: 'No name', tone: 'default' } as const)
        : ({ label: 'Named', tone: 'success' } as const);
};
