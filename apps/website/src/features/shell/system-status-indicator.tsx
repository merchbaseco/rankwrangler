import { Link, Tooltip } from '@heroui/react';
import {
    failingChecks,
    formatCount,
    fraction,
    healthCheckLabels,
    type SystemStatus,
    systemTone,
} from '@/features/status/status-model';
import { useSystemStatus } from '@/features/status/use-system-status';
import { useAdminAccess } from '@/hooks/use-admin-access';
import { cn } from '@/lib/utils';

/**
 * The banner's system status (admins only): a small "Live" pill with a green dot while every
 * health check passes, amber with a short label naming what failed. It links to System Status;
 * hovering shows each dependency's reachability and the Keepa tokens left.
 */
export const SystemStatusIndicator = () => {
    const { isAdmin } = useAdminAccess();
    const status = useSystemStatus({ enabled: isAdmin });
    if (!isAdmin) {
        return null;
    }
    const tone = systemTone(status.data);
    const label = pillLabel(status.data);
    return (
        <Tooltip closeDelay={150} delay={150}>
            <Link
                aria-label={`System status: ${label}`}
                className={cn('status-indicator', `status-indicator--${tone}`)}
                href="/status"
            >
                <span
                    aria-hidden
                    className={cn('status-indicator__dot', `status-indicator__dot--${tone}`)}
                />
                {label}
            </Link>
            <Tooltip.Content className="status-hover" placement="bottom end">
                {status.data ? <StatusHover status={status.data} /> : 'System status'}
            </Tooltip.Content>
        </Tooltip>
    );
};

const StatusHover = ({ status }: { status: SystemStatus }) => {
    const failing = failingChecks(status);
    const { keepa } = status;
    const credits = fraction(keepa.tokensLeft ?? 0, keepa.capacity);
    const creditsLow =
        keepa.tokensLeft !== null &&
        keepa.liveReserveTokens !== null &&
        keepa.tokensLeft <= keepa.liveReserveTokens;
    const capacity = formatCount(keepa.capacity ?? 0);
    return (
        <div className="status-hover__body">
            <div className="status-hover__title">
                {failing.length === 0 ? 'RankWrangler is working' : 'Needs attention'}
            </div>
            <dl className="status-hover__rows">
                {checks.map(check => {
                    const down = failing.includes(check);
                    return (
                        <div className="status-hover__row" key={check}>
                            <dt className="flex items-center gap-2">
                                <span
                                    aria-hidden
                                    className={cn(
                                        'status-indicator__dot',
                                        down
                                            ? 'status-indicator__dot--attention'
                                            : 'status-indicator__dot--ok'
                                    )}
                                />
                                {healthCheckLabels[check]}
                            </dt>
                            <dd className={down ? 'text-warning' : 'text-muted'}>
                                {down ? 'Unreachable' : 'Reachable'}
                            </dd>
                        </div>
                    );
                })}
            </dl>
            <div className="status-hover__meter">
                <div className="flex justify-between">
                    <span>Keepa tokens</span>
                    <span
                        className={cn(
                            'font-mono tabular-nums',
                            creditsLow ? 'text-warning' : 'text-muted'
                        )}
                    >
                        {keepa.tokensLeft === null
                            ? '—'
                            : `${formatCount(Math.round(keepa.tokensLeft))} / ${capacity}`}
                    </span>
                </div>
                {keepa.tokensLeft === null ? null : (
                    <span className="status-bar status-bar--sm" role="presentation">
                        <span
                            className={cn(
                                'status-bar__segment',
                                creditsLow ? 'status-tone--pending' : 'status-tone--current'
                            )}
                            style={{ flexGrow: credits }}
                        />
                        <span className="status-bar__rest" style={{ flexGrow: 1 - credits }} />
                    </span>
                )}
            </div>
        </div>
    );
};

const checks = ['postgres', 'keepa', 'spapi'] as const;

/** "Live" while healthy; otherwise the one failing dependency, or how many failed. */
const pillLabel = (status: SystemStatus | undefined) => {
    if (!status) {
        return 'Status';
    }
    const failing = failingChecks(status);
    if (failing.length === 0) {
        return 'Live';
    }
    const [only] = failing;
    return failing.length === 1 && only ? `${healthCheckLabels[only]} down` : 'Degraded';
};
