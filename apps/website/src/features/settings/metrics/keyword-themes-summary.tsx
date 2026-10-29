import { ItemCardGroup } from '@heroui-pro/react';
import { MetricKpiGroup } from './metric-kpi-group';
import type { KeywordJobsStatus } from './use-keyword-jobs-status';

/** Keyword themes: how many exist, how many autocomplete has expanded, and how many still wait. */
export const KeywordThemesSummary = ({ themes }: { themes: KeywordJobsStatus['themes'] }) => (
    <ItemCardGroup variant="transparent">
        <ItemCardGroup.Header>
            <ItemCardGroup.Title>Keyword themes</ItemCardGroup.Title>
        </ItemCardGroup.Header>
        <MetricKpiGroup
            tiles={[
                { label: 'Themes', value: themes.total },
                { label: 'Expanded', value: themes.expanded },
                { label: 'Awaiting autocomplete', value: themes.pending },
            ]}
        />
    </ItemCardGroup>
);
