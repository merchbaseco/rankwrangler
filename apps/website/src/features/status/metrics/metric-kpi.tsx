import { Button, Tooltip } from '@heroui/react';
import { KPI } from '@heroui-pro/react/kpi';
import { HelpCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { visibleUsd } from './metric-format';

export type MetricTone = 'neutral' | 'success' | 'danger';

/**
 * One metric tile, meant to sit in a KPIGroup. With `buckets` it carries the
 * series as a sparkline under the figures (KPI's chart-bottom recipe, a
 * sibling of KPI.Content); dollars format through KPI.Value's currency style;
 * `help` explains a figure whose label cannot.
 */
export const MetricKpi = ({
    buckets,
    detail,
    format = 'count',
    help,
    label,
    tone = 'neutral',
    unit,
    value,
}: {
    buckets?: readonly number[];
    detail?: string;
    format?: 'count' | 'usd';
    help?: string;
    label: string;
    tone?: MetricTone;
    unit?: string;
    value: number | null;
}) => {
    const series = buckets && buckets.length > 1 ? buckets.map(point => ({ value: point })) : null;

    return (
        <KPI>
            <KPI.Header>
                <KPI.Title>{label}</KPI.Title>
                {help ? (
                    <Tooltip>
                        <Button aria-label={`About ${label}`} isIconOnly size="sm" variant="ghost">
                            <Icon icon={HelpCircleIcon} />
                        </Button>
                        <Tooltip.Content>{help}</Tooltip.Content>
                    </Tooltip>
                ) : null}
            </KPI.Header>
            <KPI.Content>
                {value === null ? (
                    <span className="font-mono text-muted">—</span>
                ) : (
                    <KPI.Value
                        currency={format === 'usd' ? 'USD' : undefined}
                        maximumFractionDigits={format === 'usd' ? 2 : 0}
                        style={format === 'usd' ? 'currency' : 'decimal'}
                        value={format === 'usd' ? visibleUsd(value) : value}
                    >
                        {formatted => (
                            <span className={toneClass[tone]}>
                                {formatted}
                                {unit ? ` ${unit}` : ''}
                            </span>
                        )}
                    </KPI.Value>
                )}
                {detail ? <span className="text-muted text-sm">{detail}</span> : null}
            </KPI.Content>
            {series ? (
                <KPI.Chart
                    color={toneColor[tone]}
                    data={series}
                    dataKey="value"
                    height={36}
                    strokeWidth={1.5}
                />
            ) : null}
        </KPI>
    );
};

const toneColor: Readonly<Record<MetricTone, string>> = {
    danger: 'var(--danger)',
    neutral: 'var(--muted)',
    success: 'var(--success)',
};

const toneClass: Readonly<Record<MetricTone, string>> = {
    danger: 'font-mono text-danger',
    neutral: 'font-mono',
    success: 'font-mono text-success',
};
