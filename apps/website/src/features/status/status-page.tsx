import { Chip, Spinner } from '@heroui/react';
import { Navigate } from 'react-router-dom';
import { useAdminAccess } from '@/hooks/use-admin-access';
import { useAdminStats } from './metrics/use-admin-stats';
import { StatusAllowances } from './status-allowances';
import { StatusDetails } from './status-details';
import { StatusEvents } from './status-events';
import { formatRelative, pipelineLabels, type SystemStatus, systemTone } from './status-model';
import { StatusProducts } from './status-products';
import { StatusRefresh } from './status-refresh';
import { StatusSchedule } from './status-schedule';
import { StatusKeywords } from './status-keywords';
import { useSystemStatus } from './use-system-status';

/**
 * System Status (`/status`, admins only): one top-down read of the system. Schedules first, then
 * the Products and keywords indexed, provider usage against allowance, the refresh cadence per
 * BSR bucket, each pipeline's detail, and the full event log. Everyone else goes to Explore.
 */
export const StatusPage = () => {
    const access = useAdminAccess();
    if (access.isLoading) {
        return <PageSpinner />;
    }
    return access.isAdmin ? <StatusOverview /> : <Navigate replace to="/explore" />;
};

const StatusOverview = () => {
    const status = useSystemStatus();
    const stats = useAdminStats();
    return (
        <div className="status-page">
            <div className="status-page__inner">
                <StatusHeader status={status.data} />
                {status.data ? (
                    <>
                        <StatusSchedule status={status.data} />
                        <StatusProducts products={status.data.products} />
                        <StatusKeywords />
                        <StatusAllowances
                            calls={status.data.calls}
                            keepa={status.data.keepa}
                            stats={stats.data}
                        />
                    </>
                ) : status.error ? (
                    <p className="text-danger">System status did not load: {status.error.message}</p>
                ) : (
                    <PageSpinner />
                )}
                {stats.data ? <StatusRefresh stats={stats.data} /> : null}
                <StatusDetails />
                <StatusEvents />
            </div>
        </div>
    );
};

const StatusHeader = ({ status }: { status: SystemStatus | undefined }) => {
    const tone = systemTone(status);
    const failing =
        status?.health.status === 'degraded'
            ? status.health.failing
                  .map(check => (check === 'postgres' ? 'Database' : pipelineLabels[check]))
                  .join(', ')
            : null;
    return (
        <header className="status-page__header">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="status-page__title">System status</h1>
                {tone === 'unknown' ? null : (
                    <Chip color={tone === 'ok' ? 'success' : 'warning'} size="sm" variant="soft">
                        {tone === 'ok' ? 'Operational' : `Degraded · ${failing}`}
                    </Chip>
                )}
            </div>
            {status ? (
                <span className="font-mono text-muted text-sm tabular-nums">
                    Updated {formatRelative(status.observedAt)}
                </span>
            ) : null}
        </header>
    );
};

const PageSpinner = () => (
    <div aria-busy="true" className="flex min-h-40 items-center justify-center">
        <Spinner size="sm" />
    </div>
);
