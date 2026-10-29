import { Tabs } from '@heroui/react';
import { type MetricsPage, metricsPages } from '../settings-navigation';
import { SettingsPageHeader } from '../settings-page-header';
import { CutoutMetrics } from './cutout-metrics';
import { FacetMetrics } from './facet-metrics';
import { KeepaMetrics } from './keepa-metrics';
import { KeywordJobsMetrics } from './keyword-jobs-metrics';
import { ShortNameMetrics } from './short-name-metrics';
import { SpApiMetrics } from './spapi-metrics';

/**
 * Admin metrics: one tab per provider or generator. Provider tabs poll while open; Keyword jobs
 * refreshes from job activity instead.
 */
export const MetricsSettings = ({
    onPageChange,
    page,
}: {
    onPageChange: (page: MetricsPage) => void;
    page: MetricsPage;
}) => (
    <div className="flex flex-col gap-4">
        <SettingsPageHeader
            description="What the collectors and generators did recently. Provider tabs refresh every 10 seconds; Keyword jobs updates as jobs run."
            title="Metrics"
        />
        <Tabs
            onSelectionChange={key => onPageChange(key as MetricsPage)}
            selectedKey={page}
            variant="secondary"
        >
            <Tabs.ListContainer>
                <Tabs.List aria-label="Metrics">
                    {metricsPages.map(item => (
                        <Tabs.Tab id={item.id} key={item.id}>
                            {item.label}
                            <Tabs.Indicator />
                        </Tabs.Tab>
                    ))}
                </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="metrics-jobs">
                <KeywordJobsMetrics />
            </Tabs.Panel>
            <Tabs.Panel id="metrics-keepa">
                <KeepaMetrics />
            </Tabs.Panel>
            <Tabs.Panel id="metrics-spapi">
                <SpApiMetrics />
            </Tabs.Panel>
            <Tabs.Panel id="metrics-facets">
                <FacetMetrics />
            </Tabs.Panel>
            <Tabs.Panel id="metrics-short-names">
                <ShortNameMetrics />
            </Tabs.Panel>
            <Tabs.Panel id="metrics-cutouts">
                <CutoutMetrics />
            </Tabs.Panel>
        </Tabs>
    </div>
);
