import { KPIGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { MetricKpi, type MetricTone } from './metric-kpi';

export interface MetricTile {
    readonly buckets?: readonly number[];
    readonly detail?: string;
    readonly format?: 'count' | 'usd';
    readonly help?: string;
    readonly label: string;
    readonly tone?: MetricTone;
    readonly unit?: string;
    readonly value: number | null;
}

/** A row of metric tiles in one KPIGroup, separated the way the group expects. */
export const MetricKpiGroup = ({ tiles }: { tiles: readonly MetricTile[] }) => (
    <KPIGroup>
        {tiles.map((tile, index) => (
            <Fragment key={tile.label}>
                {index > 0 ? <KPIGroup.Separator /> : null}
                <MetricKpi {...tile} />
            </Fragment>
        ))}
    </KPIGroup>
);
