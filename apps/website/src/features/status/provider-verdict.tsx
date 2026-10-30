import { Chip } from '@heroui/react';
import {
    formatPercent,
    fraction,
    type Provider,
    type ProviderVerdict,
    providerTotals,
    providerVerdict,
    type SystemStatus,
} from './status-model';
import type { HeadlineFigure } from './status-panel';

/** The provider's verdict as one chip: within limits, throttled often, failing or unreachable. */
export const ProviderVerdictChip = ({
    provider,
    status,
}: {
    provider: Provider;
    status: SystemStatus;
}) => {
    const verdict = providerVerdict(status, provider);
    return (
        <Chip color={verdictColor[verdict]} size="sm" variant="soft">
            {verdictLabel[verdict]}
        </Chip>
    );
};

/**
 * The last day's throttles (HTTP 429) and other errors as two headline figures, each with its
 * share of calls; a figure turns amber or red once its share crosses the verdict's line.
 */
export const failureFigures = (status: SystemStatus, provider: Provider): HeadlineFigure[] => {
    const totals = providerTotals(status, provider);
    const verdict = providerVerdict(status, provider);
    const share = (count: number) =>
        totals.calls24h > 0 ? formatPercent(fraction(count, totals.calls24h)) : undefined;
    return [
        {
            label: 'Throttled · 24h',
            note: share(totals.throttled24h),
            tone: verdict === 'throttled' ? 'warning' : undefined,
            value: totals.throttled24h,
        },
        {
            label: 'Errors · 24h',
            note: share(totals.errors24h),
            tone: verdict === 'failing' ? 'danger' : undefined,
            value: totals.errors24h,
        },
    ];
};

const verdictLabel: Readonly<Record<ProviderVerdict, string>> = {
    failing: 'Failing often',
    healthy: 'Within limits',
    throttled: 'Throttled often',
    unreachable: 'Unreachable',
};

const verdictColor: Readonly<Record<ProviderVerdict, 'success' | 'warning' | 'danger'>> = {
    failing: 'danger',
    healthy: 'success',
    throttled: 'warning',
    unreachable: 'danger',
};
