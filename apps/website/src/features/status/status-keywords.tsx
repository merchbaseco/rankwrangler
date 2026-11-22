import { Button } from '@heroui/react';
import { useSyncControl } from '@/features/keywords/use-sync-control';
import { formatPercent, fraction } from './status-model';
import {
    Headline,
    Legend,
    type Segment,
    SegmentedBar,
    StatusBlock,
    StatusCard,
    StatusSection,
} from './status-panel';
import { useKeywordOverview } from './use-keyword-overview';

/**
 * Keywords health at a glance: graduated keywords, 24h growth and checks, and freshness of
 * graduated terms. The discovery funnel and search-suggestion sweep sit further down the page.
 */
export const StatusKeywords = () => {
    const { facets, stages } = useKeywordOverview();
    const total = stages
        ? stages.trial + stages.graduated + stages.dropped + stages.untracked
        : null;
    const freshness: Segment[] = facets
        ? [
              { key: 'live', label: 'Live', tone: 'current', value: facets.freshness.live },
              {
                  key: 'needs-sync',
                  label: 'Needs sync',
                  tone: 'pending',
                  value: facets.freshness.needsSync,
              },
              { key: 'syncing', label: 'Syncing', tone: 'accent', value: facets.freshness.syncing },
          ]
        : [];
    const liveShare =
        facets && stages && stages.graduated > 0
            ? `${formatPercent(fraction(facets.freshness.live, stages.graduated))} live`
            : null;

    return (
        <StatusSection caption={<SyncControl />} title="Keywords">
            <StatusCard>
                <Headline
                    figures={[
                        { label: 'Graduated', of: total, value: stages?.graduated ?? null },
                        { label: 'New · 24h', prefix: '+', value: facets?.newLast24h ?? null },
                        { label: 'Checked · 24h', value: facets?.minedLast24h ?? null },
                    ]}
                />
                <StatusBlock aside={liveShare} title="Freshness · Graduated">
                    <SegmentedBar label="Graduated keyword freshness" segments={freshness} />
                    <Legend segments={freshness} />
                </StatusBlock>
            </StatusCard>
        </StatusSection>
    );
};

/** Pause or resume automatic keyword sync: instantly reversible, so no confirmation. */
const SyncControl = () => {
    const sync = useSyncControl();
    if (sync.paused === null) {
        return null;
    }
    return (
        <span className="flex items-center gap-2">
            <span className={sync.paused ? 'text-warning' : 'text-muted'}>
                Sync {sync.paused ? 'paused' : 'on'}
            </span>
            {sync.canManage ? (
                <Button
                    isPending={sync.isPending}
                    onPress={() => sync.setPaused(!sync.paused)}
                    size="sm"
                    variant="outline"
                >
                    {sync.paused ? 'Resume' : 'Pause'}
                </Button>
            ) : null}
        </span>
    );
};
