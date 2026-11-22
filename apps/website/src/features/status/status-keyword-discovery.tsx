import { formatCount, formatPercent, fraction, type SystemStatus } from './status-model';
import {
    Legend,
    type Segment,
    SegmentedBar,
    StatusBlock,
    StatusCard,
    StatusSection,
} from './status-panel';
import { useKeywordOverview } from './use-keyword-overview';

/**
 * Keyword discovery pipelines: how the full keyword pool divides by stage (trial, graduated,
 * dropped, untracked) and how far the one-time search-suggestion sweep has expanded graduated
 * terms. Shares the query cache with `StatusKeywords`.
 */
export const StatusKeywordDiscovery = ({ status }: { status: SystemStatus }) => {
    const { facets, stages } = useKeywordOverview();
    const stageSegments: Segment[] = stages
        ? [
              { key: 'trial', label: 'Trial', tone: 'accent', value: stages.trial },
              { key: 'graduated', label: 'Graduated', tone: 'current', value: stages.graduated },
              { key: 'dropped', label: 'Dropped', tone: 'idle', value: stages.dropped },
              { key: 'untracked', label: 'Untracked', tone: 'faint', value: stages.untracked },
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
    const graduatedShare =
        stages && total > 0 ? `${formatPercent(fraction(stages.graduated, total))} graduated` : null;

    return (
        <StatusSection
            caption={stages ? `${formatCount(total)} total keywords` : null}
            title="Keyword discovery"
        >
            <StatusCard>
                <StatusBlock aside={graduatedShare} title="Funnel">
                    <SegmentedBar label="Keyword funnel" segments={stageSegments} />
                    <Legend segments={stageSegments} />
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
