import { Link, Tooltip } from '@heroui/react';
import { formatCount } from '@/features/status/metrics/metric-format';
import {
    fraction,
    isPipelineFailing,
    pipelineLabels,
    type SystemStatus,
    systemTone,
} from '@/features/status/status-model';
import { useSystemStatus } from '@/features/status/use-system-status';
import { useAdminAccess } from '@/hooks/use-admin-access';
import { cn } from '@/lib/utils';

/**
 * The banner's system status (admins only): one dot, green while every health check passes and
 * amber when one fails, linking to System Status. Hovering shows each pipeline's state and the
 * Keepa credit left, so a glance answers "is it working" without naming internals in the banner.
 */
export const SystemStatusIndicator = () => {
    const { isAdmin } = useAdminAccess();
    const status = useSystemStatus({ enabled: isAdmin });
    if (!isAdmin) {
        return null;
    }
    const tone = systemTone(status.data);
    const label = { attention: 'Needs attention', ok: 'All systems normal', unknown: 'Status' }[
        tone
    ];
    return (
        <Tooltip closeDelay={150} delay={150}>
            <Link
                aria-label={`System status: ${label}`}
                className="status-indicator"
                href="/status"
            >
                <span
                    aria-hidden
                    className={cn('status-indicator__dot', `status-indicator__dot--${tone}`)}
                />
            </Link>
            <Tooltip.Content className="status-hover" placement="bottom end">
                {status.data ? <StatusHover status={status.data} /> : label}
            </Tooltip.Content>
        </Tooltip>
    );
};

const StatusHover = ({ status }: { status: SystemStatus }) => {
    const credits = fraction(status.keepa.tokensLeft ?? 0, status.keepa.capacity);
    const creditsLow =
        status.keepa.tokensLeft !== null &&
        status.keepa.liveReserveTokens !== null &&
        status.keepa.tokensLeft <= status.keepa.liveReserveTokens;
    const capacity = formatCount(status.keepa.capacity ?? 0);
    return (
        <div className="status-hover__body">
            <div className="status-hover__title">
                {systemTone(status) === 'ok' ? 'All systems normal' : 'Needs attention'}
            </div>
            <dl className="status-hover__rows">
                {status.pipelines.map(pipeline => {
                    const failing = isPipelineFailing(status, pipeline.pipeline);
                    return (
                        <div className="status-hover__row" key={pipeline.pipeline}>
                            <dt className="flex items-center gap-2">
                                <span
                                    aria-hidden
                                    className={cn(
                                        'status-indicator__dot',
                                        failing
                                            ? 'status-indicator__dot--attention'
                                            : 'status-indicator__dot--ok'
                                    )}
                                />
                                {pipelineLabels[pipeline.pipeline]}
                            </dt>
                            <dd className={failing ? 'text-warning' : 'text-muted'}>
                                {pipeline.overdue > 0
                                    ? `${formatCount(pipeline.overdue)} overdue`
                                    : 'On schedule'}
                            </dd>
                        </div>
                    );
                })}
            </dl>
            <div className="status-hover__meter">
                <div className="flex justify-between">
                    <span>Keepa credits</span>
                    <span
                        className={cn(
                            'font-mono tabular-nums',
                            creditsLow ? 'text-warning' : 'text-muted'
                        )}
                    >
                        {status.keepa.tokensLeft === null
                            ? '—'
                            : `${formatCount(Math.round(status.keepa.tokensLeft))} / ${capacity}`}
                    </span>
                </div>
                {status.keepa.tokensLeft === null ? null : (
                <span className="status-bar status-bar--sm" role="presentation">
                    <span
                        className={cn(
                            'status-bar__segment',
                            creditsLow ? 'status-tone--due' : 'status-tone--current'
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
