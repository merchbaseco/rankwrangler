import { Button } from '@heroui/react';
import { useSyncControl } from '@/features/keywords/use-sync-control';
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
 * Keywords in one card, both as the same segmented bar: every keyword by stage (Brand Analytics
 * terms start in trial and graduate once page one shows three Merch Products; dropped is a normal
 * end state), then the graduated keywords' freshness. Automatic sync is paused and resumed here.
 */
export const StatusKeywords = () => {
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
    const total = stageSegments.reduce((sum, segment) => sum + segment.value, 0);

    return (
        <StatusSection caption={<SyncControl />} title="Keywords">
            <StatusCard>
                <Headline
                    figures={[
                        { label: 'Keywords', value: stages ? total : null },
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
