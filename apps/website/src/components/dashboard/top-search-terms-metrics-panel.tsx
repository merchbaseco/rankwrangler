import { useMemo, useState } from 'react';
import { TopSearchTermsDatasetTable } from '@/components/dashboard/top-search-terms-dataset-table';
import { TopSearchTermsJobExecutionsTable } from '@/components/dashboard/top-search-terms-job-executions-table';
import { api } from '@/lib/trpc';
import { cn, formatNumber } from '@/lib/utils';

const SETTINGS_METRICS_POLL_INTERVAL_MS = 10_000;
const TOP_SEARCH_TERMS_JOB_NAMES = [
    'fetch-top-search-terms-dataset',
    'sync-top-search-terms-datasets',
] as const;

type TopSearchTermsMetricView = 'datasets' | 'success' | 'failed';
type DatasetTab = 'daily' | 'weekly';

export const TopSearchTermsMetricsPanel = () => {
    const [selectedView, setSelectedView] = useState<TopSearchTermsMetricView>('datasets');
    const [datasetTab, setDatasetTab] = useState<DatasetTab>('daily');

    const statusQuery = api.api.app.topSearchTermsStatus.useQuery(undefined, {
        refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        retry: false,
    });
    const jobQueryInput = useMemo(() => {
        if (selectedView === 'datasets') {
            return undefined;
        }

        return {
            limit: 100,
            status: selectedView,
            jobNames: [...TOP_SEARCH_TERMS_JOB_NAMES],
        };
    }, [selectedView]);
    const jobQuery = api.api.app.jobExecutions.useQuery(jobQueryInput, {
        enabled: jobQueryInput !== undefined,
        retry: false,
        refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
    });

    if (statusQuery.isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading Top Search Terms metrics…</p>
            </div>
        );
    }

    if (statusQuery.error || !statusQuery.data) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-destructive">Failed to load Top Search Terms metrics.</p>
            </div>
        );
    }

    const { stats, datasets } = statusQuery.data;
    const activeDatasetRows = datasetTab === 'daily' ? datasets.daily : datasets.weekly;

    return (
        <div className="flex h-full flex-col">
            <div className="grid grid-cols-3 border-b border-border">
                <StatTile
                    label="Top Search Terms"
                    value={formatNumber(stats.totalTopSearchTerms)}
                    valueClassName="text-foreground"
                    isSelected={selectedView === 'datasets'}
                    onClick={() => {
                        if (selectedView === 'datasets') {
                            void statusQuery.refetch();
                            return;
                        }
                        setSelectedView('datasets');
                    }}
                />
                <StatTile
                    label="Job Successes"
                    value={formatNumber(stats.jobSuccesses)}
                    valueClassName="text-success-foreground"
                    withLeftBorder
                    isSelected={selectedView === 'success'}
                    onClick={() => {
                        if (selectedView === 'success') {
                            void Promise.all([statusQuery.refetch(), jobQuery.refetch()]);
                            return;
                        }
                        setSelectedView('success');
                    }}
                />
                <StatTile
                    label="Job Failures"
                    value={formatNumber(stats.jobFailures)}
                    valueClassName="text-destructive"
                    withLeftBorder
                    isSelected={selectedView === 'failed'}
                    onClick={() => {
                        if (selectedView === 'failed') {
                            void Promise.all([statusQuery.refetch(), jobQuery.refetch()]);
                            return;
                        }
                        setSelectedView('failed');
                    }}
                />
            </div>

            {selectedView === 'datasets' && (
                <div className="flex items-center gap-0 border-b border-border">
                    <DatasetTabButton
                        label="Daily"
                        count={datasets.daily.length}
                        isActive={datasetTab === 'daily'}
                        onClick={() => setDatasetTab('daily')}
                    />
                    <DatasetTabButton
                        label="Weekly"
                        count={datasets.weekly.length}
                        isActive={datasetTab === 'weekly'}
                        onClick={() => setDatasetTab('weekly')}
                    />
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
                {selectedView === 'datasets' ? (
                    <TopSearchTermsDatasetTable rows={activeDatasetRows} />
                ) : jobQuery.isLoading ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
                ) : jobQuery.error ? (
                    <p className="px-3 py-2 text-xs text-destructive">
                        Failed to load job executions.
                    </p>
                ) : (
                    <TopSearchTermsJobExecutionsTable
                        jobs={jobQuery.data ?? []}
                    />
                )}
            </div>
        </div>
    );
};

const StatTile = ({
    label,
    value,
    valueClassName,
    onClick,
    isSelected = false,
    withLeftBorder = false,
}: {
    label: string;
    value: string;
    valueClassName: string;
    onClick?: () => void;
    isSelected?: boolean;
    withLeftBorder?: boolean;
}) => {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'cursor-pointer p-3 text-left transition-colors hover:bg-accent',
                withLeftBorder && 'border-l border-border',
                isSelected && 'bg-accent',
            )}
        >
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            <p className={cn('stat-value mt-1 font-mono text-2xl font-bold', valueClassName)}>
                {value}
            </p>
        </button>
    );
};

const DatasetTabButton = ({
    label,
    count,
    isActive,
    onClick,
}: {
    label: string;
    count: number;
    isActive: boolean;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors',
            isActive
                ? 'border-b-2 border-foreground text-foreground'
                : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
        )}
    >
        {label}
        <span className="ml-1.5 font-mono text-muted-foreground">{formatNumber(count)}</span>
    </button>
);
