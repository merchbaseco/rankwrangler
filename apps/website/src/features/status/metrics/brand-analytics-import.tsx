import { Alert } from '@heroui/react';
import { ItemCardGroup } from '@heroui-pro/react';
import { formatCount } from './metric-format';
import { MetricKpiGroup } from './metric-kpi-group';
import type { KeywordJobsStatus } from './use-keyword-jobs-status';

type BrandAnalytics = KeywordJobsStatus['brandAnalytics'];

/**
 * The weekly Brand Analytics import that feeds keyword trials: the last imported week, the kept
 * search terms, how many the last import added, how many still await a trial or their prefix,
 * and the latest report's state with its last error.
 */
export const BrandAnalyticsImport = ({ status }: { status: BrandAnalytics }) => {
    const { awaitingPrefix, awaitingTrial, keptTerms, lastImported, latestWeek } = status;
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Brand Analytics import</ItemCardGroup.Title>
                <ItemCardGroup.Description>
                    {lastImported
                        ? `Last imported week ${lastImported.weekStart} – ${lastImported.weekEnd}.`
                        : 'No week imported yet.'}{' '}
                    {latestWeek
                        ? `Report for ${latestWeek.weekStart}: ${reportState(latestWeek.status, latestWeek.reportStatus)}.`
                        : 'No report requested yet.'}
                </ItemCardGroup.Description>
            </ItemCardGroup.Header>
            <MetricKpiGroup
                tiles={[
                    {
                        help: 'Search terms whose top clicked products include a Merch product type.',
                        label: 'Kept search terms',
                        value: keptTerms,
                    },
                    {
                        detail:
                            lastImported?.keptTerms == null
                                ? undefined
                                : `of ${formatCount(lastImported.keptTerms)} kept`,
                        label: 'New terms last import',
                        value: lastImported?.newTerms ?? null,
                    },
                    {
                        help: 'Kept terms not yet registered as keyword trials.',
                        label: 'Awaiting trial',
                        value: awaitingTrial,
                    },
                    {
                        help: 'Product-text terms waiting for their keyword prefix.',
                        label: 'Awaiting prefix',
                        value: awaitingPrefix,
                    },
                ]}
            />
            {latestWeek?.lastError ? (
                <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>Last report error</Alert.Title>
                        <Alert.Description data-selectable-text>
                            {latestWeek.lastError}
                        </Alert.Description>
                    </Alert.Content>
                </Alert>
            ) : null}
        </ItemCardGroup>
    );
};

const reportState = (status: string, reportStatus: string | null) => {
    switch (status) {
        case 'pending':
            return reportStatus
                ? `waiting to request again (${reportStatus})`
                : 'waiting to request';
        case 'requested':
            return `generating${reportStatus ? ` (${reportStatus})` : ''}`;
        case 'ready':
            return 'importing';
        case 'imported':
            return 'imported';
        default:
            return status;
    }
};
