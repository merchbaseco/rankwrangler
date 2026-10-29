import { ItemCardGroup } from '@heroui-pro/react';
import { MetricKpiGroup } from './metric-kpi-group';
import type { KeywordJobsStatus } from './use-keyword-jobs-status';

/** Keyword prefixes: how many exist, how many autocomplete has expanded, and how many still wait. */
export const KeywordPrefixesSummary = ({
    prefixes,
}: {
    prefixes: KeywordJobsStatus['prefixes'];
}) => (
    <ItemCardGroup variant="transparent">
        <ItemCardGroup.Header>
            <ItemCardGroup.Title>Keyword prefixes</ItemCardGroup.Title>
        </ItemCardGroup.Header>
        <MetricKpiGroup
            tiles={[
                { label: 'Prefixes', value: prefixes.total },
                { label: 'Expanded', value: prefixes.expanded },
                { label: 'Awaiting autocomplete', value: prefixes.pending },
            ]}
        />
    </ItemCardGroup>
);
