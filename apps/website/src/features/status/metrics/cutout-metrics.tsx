import { GenerationMetrics } from './generation-metrics';
import { formatCount } from './metric-format';
import { MetricsState } from './metrics-state';
import { useCutoutMetrics } from './use-cutout-metrics';

export const CutoutMetrics = () => {
    const query = useCutoutMetrics();

    if (!query.data) {
        return <MetricsState error={Boolean(query.error)} label="Cutout metrics" />;
    }

    const { activity, coverage, hourly, recent } = query.data;

    return (
        <GenerationMetrics
            activity={[
                { label: 'Generated · 24h', tone: 'success', value: activity.generated },
                { label: 'Failed · 24h', tone: 'danger', value: activity.failed },
                {
                    label: 'Stored · 24h',
                    unit: 'KiB',
                    value: Math.round(activity.bytesStored / 1024),
                },
                {
                    detail: `${formatCount(activity.transformErrors)} errors`,
                    label: 'Image transforms · 24h',
                    value: activity.transformCalls,
                },
                {
                    detail: `${formatCount(activity.uploadErrors)} errors`,
                    label: 'R2 uploads · 24h',
                    value: activity.uploadCalls,
                },
            ]}
            coverage={[
                { label: 'Eligible Products', value: coverage.eligible },
                { label: 'Current cutouts', value: coverage.ready },
                { label: 'Never requested', value: coverage.neverRequested },
                { label: 'Needs regeneration', value: coverage.needsRegeneration },
                { label: 'Pending or failed', value: coverage.pending + coverage.error },
            ]}
            generatedLabel="Generated"
            hourly={hourly}
            note="Cutouts are generated on request. A changed source image or generator version is processed on the next request."
            recent={recent.map(row => ({
                asin: row.asin,
                label: row.status === 'failed' ? 'Failed' : 'Generated',
                occurredAt: row.occurredAt,
                tone: row.status === 'failed' ? 'danger' : 'success',
            }))}
        />
    );
};
