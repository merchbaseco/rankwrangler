import { Chip, Tooltip } from '@heroui/react';
import {
    formatCount,
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
 * Secondary Keepa header chip when eligible `<1M` BSR listings are waiting for admission (either
 * paused on an overdue backlog or throttled by daily token headroom). Renders nothing when open.
 */
export const KeepaAdmissionChip = ({
    admission,
}: {
    admission: SystemStatus['keepa']['admission'];
}) => {
    if (!admission || admission.state === 'open') {
        return null;
    }
    const isPaused = admission.state === 'paused';
    const label = isPaused ? 'Admission paused' : `${formatCount(admission.waiting)} waiting`;
    const tooltip = isPaused
        ? formatPausedTooltip(admission.overdue, admission.oldestOverdueAt)
        : `${formatCount(admission.waiting)} eligible listings under 1M BSR are waiting for Keepa daily token headroom.`;
    return (
        <Tooltip closeDelay={0} delay={150}>
            <Tooltip.Trigger<'span'> render={props => <span {...props} />}>
                <Chip color={isPaused ? 'warning' : 'default'} size="sm" variant="soft">
                    {label}
                </Chip>
            </Tooltip.Trigger>
            <Tooltip.Content className="max-w-72">{tooltip}</Tooltip.Content>
        </Tooltip>
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

const formatPausedTooltip = (overdue: number, oldestOverdueAt: string | null) => {
    const ageDays = oldestOverdueAt
        ? Math.max(1, Math.round((Date.now() - Date.parse(oldestOverdueAt)) / 86_400_000))
        : null;
    const prefix = ageDays
        ? `Backlog ${ageDays} ${ageDays === 1 ? 'day' : 'days'} overdue`
        : 'Backlog overdue';
    return `${prefix} · ${formatCount(overdue)} late. New listings resume once it clears.`;
};
