import { Alert, Button, Chip, Spinner } from '@heroui/react';
import { BrandAnalyticsImport } from './brand-analytics-import';
import { keywordJobNames } from './job-run-filters';
import { JobRunsSection } from './job-runs-section';
import { KeywordJobQueuesGrid } from './keyword-job-queues-grid';
import { KeywordThemesSummary } from './keyword-themes-summary';
import { formatAge } from './metric-age';
import { formatCount } from './metric-format';
import { MetricKpiGroup } from './metric-kpi-group';
import { useJobActivity } from './use-job-activity';
import { type KeywordJobsStatus, useKeywordJobsStatus } from './use-keyword-jobs-status';

/**
 * Keyword jobs: pause state, scan backlog against its allowance, the weekly Brand Analytics
 * import, each keyword queue with its provider's readiness, and recent runs. Unlike the other tabs it never polls; it refreshes when
 * a keyword job run is recorded (`jobs.activity`).
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
            <MetricKpiGroup tiles={backlogTiles(query.data)} />
            <BrandAnalyticsImport status={query.data.brandAnalytics} />
            <KeywordThemesSummary themes={query.data.themes} />
            <KeywordJobQueuesGrid status={query.data} />
            <JobRunsSection isEventDriven jobNames={keywordJobNames} />
        </div>
    );
};

const PipelineState = ({ status }: { status: KeywordJobsStatus }) => {
    const producers = producerState(status);
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Chip color={status.paused ? 'warning' : 'success'} size="sm" variant="soft">
                Pipeline {status.paused ? 'paused' : 'running'}
            </Chip>
            <Chip color={producers.color} size="sm" variant="soft">
                New trials and autocomplete {producers.label}
            </Chip>
        </div>
    );
};

const producerState = ({ backlog, paused }: KeywordJobsStatus) => {
    if (paused) {
        return { color: 'warning', label: 'paused' } as const;
    }
    return backlog.producersOpen
        ? ({ color: 'success', label: 'admitted' } as const)
        : ({ color: 'warning', label: 'held back by scan backlog' } as const);
};

const backlogTiles = ({ backlog }: KeywordJobsStatus) => [
    {
        detail: `of ${formatCount(backlog.allowancePages)} page allowance`,
        help: 'Keyword result pages queued for scanning. New trials and autocomplete work are held back while this exceeds the allowance.',
        label: 'Scan backlog',
        unit: 'pages',
        value: backlog.queuedPages,
    },
    {
        detail: `oldest ${formatAge(backlog.oldestDueHeadAt) ?? 'none'}`,
        help: 'Tracked keywords whose recurring first-page check is due now.',
        label: 'Checks due',
        value: backlog.dueHeads,
    },
    {
        help: 'Background SP-API scan rate, as result pages per day.',
        label: 'Scan capacity',
        unit: 'pages/day',
        value: backlog.pagesPerDay,
    },
];
