import { Tabs } from '@heroui/react';
import { CollectionStatusSection } from './metrics/collection-status-section';
import { CutoutMetrics } from './metrics/cutout-metrics';
import { FacetMetrics } from './metrics/facet-metrics';
import { KeywordJobsMetrics } from './metrics/keyword-jobs-metrics';
import { ShortNameMetrics } from './metrics/short-name-metrics';
import { StatusSection } from './status-panel';

const details = [
    { id: 'keyword-jobs', label: 'Keyword jobs', panel: <KeywordJobsMetrics /> },
    { id: 'collection', label: 'Collection', panel: <CollectionStatusSection /> },
    { id: 'facets', label: 'Facets', panel: <FacetMetrics /> },
    { id: 'short-names', label: 'Short names', panel: <ShortNameMetrics /> },
    { id: 'cutouts', label: 'Cutouts', panel: <CutoutMetrics /> },
] as const;

/**
 * The drill-down under the overview: each collector's and generator's own queues, coverage and
 * recent runs. Only the open tab mounts, so only it polls.
 */
export const StatusDetails = () => (
    <StatusSection caption="Queues, coverage and recent runs" title="Pipeline detail">
        <Tabs variant="secondary">
            <Tabs.ListContainer>
                <Tabs.List aria-label="Pipeline detail">
                    {details.map(item => (
                        <Tabs.Tab id={item.id} key={item.id}>
                            {item.label}
                            <Tabs.Indicator />
                        </Tabs.Tab>
                    ))}
                </Tabs.List>
            </Tabs.ListContainer>
            {details.map(item => (
                <Tabs.Panel id={item.id} key={item.id}>
                    <div className="pt-4">{item.panel}</div>
                </Tabs.Panel>
            ))}
        </Tabs>
    </StatusSection>
);
