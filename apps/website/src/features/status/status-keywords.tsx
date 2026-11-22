import { Button } from '@heroui/react';
import { useSyncControl } from '@/features/keywords/use-sync-control';
import { formatCount, type SystemStatus } from './status-model';
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
 * Keywords in one card: every keyword by stage (Brand Analytics and search-suggestion terms start
 * in trial and graduate once page one shows three Merch Products), graduated freshness, and
 * one-time search-suggestion expansion across graduated keywords.
 */
export const StatusKeywords = ({ status }: { status: SystemStatus }) => {
    const { facets, stages } = useKeywordOverview();
    const stageSegments: Segment[] = stages
        ? [
              { key: 'trial', label: 'Trial', tone: 'accent', value: stages.trial },
              { key: 'graduated', label: 'Graduated', tone: 'current', value: stages.graduated },
              { key: 'dropped', label: 'Dropped', tone: 'idle', value: stages.dropped },
              { key: 'untracked', label: 'Untracked', tone: 'faint', value: stages.untracked },
          ]
        : [];
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
    const expansion: Segment[] = facets
        ? [
              {
                  key: 'expanded',
                  label: 'Expanded',
                  tone: 'current',
                  value: facets.expansion.complete,
              },
              {
                  key: 'remaining',
                  label: 'Remaining',
                  tone: 'idle',
                  value: facets.expansion.remaining,
              },
          ]
        : [];
    const total = stageSegments.reduce((sum, segment) => sum + segment.value, 0);

    return (
        <StatusSection caption={<SyncControl />} title="Keywords">
            <StatusCard>
                <Headline
                    figures={[
                        { label: 'Keywords', value: stages ? total : null },
                        { label: 'Graduated', value: stages?.graduated ?? null },
                        { label: 'New · 24h', prefix: '+', value: facets?.newLast24h ?? null },
                        { label: 'Checked · 24h', value: facets?.minedLast24h ?? null },
                    ]}
                />
                <StatusBlock title="Stage">
                    <SegmentedBar label="Keyword stage" segments={stageSegments} />
                    <Legend segments={stageSegments} />
                </StatusBlock>
                <StatusBlock title="Freshness of graduated">
                    <SegmentedBar label="Graduated keyword freshness" segments={freshness} />
                    <Legend segments={freshness} />
                </StatusBlock>
                <StatusBlock
                    aside={
                        <ExpansionAside
                            configured={status.autocomplete.configured}
                            expandedLast24h={facets?.expansion.expandedLast24h ?? null}
                            remaining={facets?.expansion.remaining ?? null}
                        />
                    }
                    title="Search suggestions"
                >
                    <SegmentedBar label="Search suggestion expansion" segments={expansion} />
                    <Legend segments={expansion} showShare />
                </StatusBlock>
            </StatusCard>
        </StatusSection>
    );
};

const ExpansionAside = ({
    configured,
    expandedLast24h,
    remaining,
}: {
    configured: boolean;
    expandedLast24h: number | null;
    remaining: number | null;
}) => {
    if (!configured) {
        return <span className="text-warning">Relay off</span>;
    }
    if (expandedLast24h === null || remaining === null) {
        return null;
    }
    if (remaining === 0 && expandedLast24h === 0) {
        return 'All expanded';
    }
    return `Relay active · ${formatCount(expandedLast24h)} expanded · 24h`;
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
