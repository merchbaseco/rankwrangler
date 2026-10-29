import { Alert, Button, Spinner } from '@heroui/react';
import { ItemCardGroup } from '@heroui-pro/react';
import { useCollectionStatus } from '@/hooks/use-collection-status';
import type { RouterOutputs } from '@/lib/trpc';
import { formatCount } from './metric-format';
import { MetricKpiGroup } from './metric-kpi-group';

type CollectionStatus = RouterOutputs['api']['app']['collectionStatus'];

/** What the collectors are doing: capacity, backlogs, and the last day's yield. */
export const CollectionStatusSection = () => {
    const query = useCollectionStatus();

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Collection</ItemCardGroup.Title>
                {query.data ? (
                    <ItemCardGroup.Description>
                        {query.data.keepa.fresh
                            ? 'Keepa capacity observed.'
                            : 'Keepa capacity awaiting observation.'}
                    </ItemCardGroup.Description>
                ) : null}
            </ItemCardGroup.Header>
            {query.isLoading ? <Spinner size="sm" /> : null}
            {query.data ? <CollectionStatusBody status={query.data} /> : null}
            {query.isLoading || query.data ? null : (
                <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>Collection status did not load</Alert.Title>
                    </Alert.Content>
                    <Button onPress={() => query.refetch()} size="sm" variant="outline">
                        Retry
                    </Button>
                </Alert>
            )}
        </ItemCardGroup>
    );
};

const CollectionStatusBody = ({ status }: { status: CollectionStatus }) => {
    const { exploration, history, keepa } = status;
    const rows = statRows(status);

    return (
        <div className="flex flex-col gap-3">
            {rows.map(row => (
                <MetricKpiGroup key={row.map(tile => tile.label).join()} tiles={row} />
            ))}
            {history.overload.newAdmissionsPaused ? (
                <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>
                            New history admissions are paused while overdue work catches up.
                        </Alert.Title>
                    </Alert.Content>
                </Alert>
            ) : null}
            <ul className="flex flex-col gap-1 px-4 text-muted text-sm">
                <li>
                    {exploration.capacity
                        ? `SP-API background: ${exploration.capacity.backgroundRps.toFixed(2)} requests/second · ${(exploration.capacity.backgroundShare * 100).toFixed(0)}% of effective capacity · no daily pilot cap`
                        : 'SP-API capacity awaiting observation'}
                </li>
                <li>
                    Sources:{' '}
                    {exploration.sources
                        .map(row => `${sourceLabels[row.kind] ?? row.kind} ${row.targets}`)
                        .join(' · ') || 'awaiting candidates'}
                    . Source counts can overlap.
                </li>
                {exploration.yield24h.legacy_pages > 0 ? (
                    <li>
                        Yield totals cover {exploration.yield24h.measured_pages} measured pages;{' '}
                        {exploration.yield24h.legacy_pages} older pages have no yield counters.
                    </li>
                ) : null}
                <li>
                    Keepa:{' '}
                    {keepa.estimatedTokensLeft === null
                        ? 'unknown balance'
                        : `${formatCount(keepa.estimatedTokensLeft)} estimated tokens`}
                    {keepa.refillRate === null ? '' : ` · ${keepa.refillRate}/min refill`}
                    {keepa.liveReserveTokens === null
                        ? ''
                        : ` · ${keepa.liveReserveTokens} kept for live requests`}
                </li>
                {keepa.rollingHour.length > 0 ? (
                    <li>
                        Last hour:{' '}
                        {keepa.rollingHour
                            .map(
                                row =>
                                    `${workLabels[row.workClass] ?? row.workClass} ${row.actualTokens} used${row.reservedUnknownTokens > 0 ? ` + ${row.reservedUnknownTokens} held` : ''}`
                            )
                            .join(' · ')}
                    </li>
                ) : null}
                {exploration.standings.length > 0
                    ? exploration.standings.slice(0, 5).map(row => (
                          <li data-selectable-text key={row.keyword}>
                              {row.keyword} · {row.tracking} / {row.tier} · score{' '}
                              {row.score ?? 'unrated'} · ~{row.interval_days}{' '}
                              {row.interval_days === 1 ? 'day' : 'days'} between checks
                          </li>
                      ))
                    : null}
            </ul>
        </div>
    );
};

const statRows = ({ exploration, history, keywords }: CollectionStatus) => {
    const sum = <T,>(rows: readonly T[], pick: (row: T) => number) =>
        rows.reduce((total, row) => total + pick(row), 0);
    return [
        [
            {
                label: 'Automatic history',
                value: sum(history.admissions, row => row.automaticEligible),
            },
            {
                label: 'Awaiting history capacity',
                value: history.admissions.find(row => row.state === 'paused')?.products ?? 0,
            },
            { label: 'History overdue', value: history.overload.overdueCount },
            { label: 'Keyword checks due', value: sum(keywords, row => row.due) },
            { label: 'Exploration ready', value: sum(exploration.passes, row => row.ready) },
        ],
        [
            { label: 'SP-API discovery · 24h', value: exploration.yield24h.physical_starts },
            { label: 'Acquisition targets', value: sum(exploration.scopes, row => row.enabled) },
            {
                detail: `of ${formatCount(exploration.brandAnalytics.kept)} kept`,
                label: 'Brand Analytics trials',
                value: exploration.brandAnalytics.registered,
            },
            { label: 'New listings · 24h', value: exploration.yield24h.new_products },
            { label: 'New Merch · 24h', value: exploration.yield24h.new_merch },
        ],
    ];
};

const workLabels: Readonly<Record<string, string>> = {
    discovery: 'Discovery',
    head: 'Keyword checks',
    history: 'Product history',
    interactive: 'Interactive',
};

const sourceLabels: Readonly<Record<string, string>> = {
    adsRecommendation: 'Amazon Ads (retired)',
    autocomplete: 'Autocomplete',
    brandAnalytics: 'Brand Analytics',
    catalogBrand: 'Catalog brands',
    catalogFacet: 'Catalog topics',
    interest: 'Research interest',
    legacy: 'Imported',
    prefixAutocomplete: 'Prefix autocomplete',
};
