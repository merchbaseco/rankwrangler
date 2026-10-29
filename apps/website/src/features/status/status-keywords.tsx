import { Button } from '@heroui/react';
import { useSyncControl } from '@/features/keywords/use-sync-control';
import { formatCount } from './metrics/metric-format';
import {
    Headline,
    Legend,
    type Segment,
    SegmentedBar,
    StatusCard,
    StatusSection,
} from './status-panel';
import { useKeywordOverview } from './use-keyword-overview';

const stageRows = [
    { key: 'trial', label: 'Trial', tone: 'idle' },
    { key: 'graduated', label: 'Graduated', tone: 'current' },
    { key: 'dropped', label: 'Dropped', tone: 'alert' },
    { key: 'untracked', label: 'Untracked', tone: 'faint' },
] as const;

/**
 * Keywords: every keyword by stage (Brand Analytics terms start in trial and graduate once page
 * one shows three Merch Products), and the graduated keywords' freshness. Automatic keyword
 * sync is paused and resumed here.
 */
export const StatusKeywords = () => {
    const { facets, stages } = useKeywordOverview();
    const total = stages ? stageRows.reduce((sum, row) => sum + stages[row.key], 0) : null;
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

    return (
        <StatusSection caption="Trial, graduation and freshness" title="Keywords">
            <div className="status-pair">
                <StatusCard
                    aside={total === null ? null : `${formatCount(total)} keywords`}
                    title="Stage"
                >
                    <dl className="status-rows">
                        {stageRows.map(row => (
                            <div className="status-row" key={row.key}>
                                <dt>{row.label}</dt>
                                <dd className="status-row__bar">
                                    <SegmentedBar
                                        label={row.label}
                                        segments={[
                                            {
                                                key: row.key,
                                                label: row.label,
                                                tone: row.tone,
                                                value: stages?.[row.key] ?? 0,
                                            },
                                        ]}
                                        size="sm"
                                        total={total}
                                    />
                                </dd>
                                <dd className="status-row__value">
                                    {stages ? formatCount(stages[row.key]) : '—'}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </StatusCard>
                <StatusCard aside={<SyncControl />} title="Freshness">
                    <Headline
                        figures={[
                            { label: 'Graduated', value: facets?.stage.graduated ?? null },
                            { label: 'Checked · 24h', value: facets?.minedLast24h ?? null },
                        ]}
                    />
                    <SegmentedBar label="Freshness" segments={freshness} size="sm" />
                    <Legend segments={freshness} />
                </StatusCard>
            </div>
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
