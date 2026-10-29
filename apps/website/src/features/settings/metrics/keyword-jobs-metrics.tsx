import { Alert, Button, Chip, Spinner } from '@heroui/react';
import { BrandAnalyticsImport } from './brand-analytics-import';
import { keywordJobNames } from './job-run-filters';
import { JobRunsSection } from './job-runs-section';
import { KeywordJobQueuesGrid } from './keyword-job-queues-grid';
import { KeywordPrefixesSummary } from './keyword-prefixes-summary';
import { formatAge } from './metric-age';
import { MetricKpiGroup } from './metric-kpi-group';
import { useJobActivity } from './use-job-activity';
import { type KeywordJobsStatus, useKeywordJobsStatus } from './use-keyword-jobs-status';

/**
 * Keyword jobs: pause state, keywords waiting on a first-page scan, the weekly Brand Analytics
 * import, keyword prefixes, each keyword queue with its provider's readiness, and recent runs.
 * Unlike the other tabs it never polls; it refreshes when a keyword job run is recorded
 * (`jobs.activity`).
 */
export const KeywordJobsMetrics = () => {
    useJobActivity(keywordJobNames);
    const query = useKeywordJobsStatus();

    if (!query.data) {
        return query.error ? (
            <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Keyword jobs did not load</Alert.Title>
                    <Alert.Description>{query.error.message}</Alert.Description>
                </Alert.Content>
                <Button
                    onPress={() => {
                        query.refetch().catch(() => undefined);
                    }}
                    size="sm"
                    variant="danger"
                >
                    Retry
                </Button>
            </Alert>
        ) : (
            <div aria-busy="true" className="flex min-h-24 items-center justify-center">
                <Spinner size="sm" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <PipelineState status={query.data} />
            <MetricKpiGroup tiles={scanDueTiles(query.data)} />
            <BrandAnalyticsImport status={query.data.brandAnalytics} />
            <KeywordPrefixesSummary prefixes={query.data.prefixes} />
            <KeywordJobQueuesGrid status={query.data} />
            <JobRunsSection isEventDriven jobNames={keywordJobNames} />
        </div>
    );
};

const PipelineState = ({ status }: { status: KeywordJobsStatus }) => (
    <div className="flex flex-wrap items-center gap-2">
        <Chip color={status.paused ? 'warning' : 'success'} size="sm" variant="soft">
            Pipeline {status.paused ? 'paused' : 'running'}
        </Chip>
    </div>
);

const scanDueTiles = ({ scanDue }: KeywordJobsStatus) => [
    {
        help: 'Keywords, mostly new trials, that have not had their first-page scan yet.',
        label: 'Awaiting first scan',
        value: scanDue.awaitingFirstScan,
    },
    {
        detail: `oldest ${formatAge(scanDue.oldestCheckDueAt) ?? 'none'}`,
        help: 'Observed keywords whose recurring first-page check is due now.',
        label: 'Checks due',
        value: scanDue.checksDue,
    },
];
