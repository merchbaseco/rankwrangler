import { Alert, Spinner } from '@heroui/react';
import { Navigate } from 'react-router-dom';
import { useAdminAccess } from '@/hooks/use-admin-access';
import { StatusEvents } from './status-events';
import { StatusKeywords } from './status-keywords';
import { failingChecks, healthCheckLabels, type SystemStatus } from './status-model';
import { StatusProducts } from './status-products';
import { StatusProviders } from './status-providers';
import { useRefreshTiers } from './use-refresh-tiers';
import { useSystemStatus } from './use-system-status';

/**
 * System Status (`/status`, admins only): one top-down read of the system. Products and their
 * sync status, keywords by stage and freshness, Keepa and SP-API usage each above its refresh
 * tiers, then the event log explorer. A failing health check adds one alert at the top. Everyone
 * else goes to Explore.
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
    const tiers = useRefreshTiers();
    return (
        <div className="status-page">
            <div className="status-page__inner">
                <h1 className="sr-only">System status</h1>
                {status.data ? (
                    <>
                        <HealthAlert status={status.data} />
                        <StatusProducts products={status.data.products} />
                        <StatusKeywords />
                        <StatusProviders status={status.data} tiers={tiers.data} />
                    </>
                ) : status.error ? (
                    <p className="text-danger">
                        System status did not load: {status.error.message}
                    </p>
                ) : (
                    <PageSpinner />
                )}
                <StatusEvents />
            </div>
        </div>
    );
};

/** One slim alert while `/api/health` is degraded, naming what failed; nothing while it is ok. */
const HealthAlert = ({ status }: { status: SystemStatus }) => {
    const failing = failingChecks(status);
    if (failing.length === 0) {
        return null;
    }
    return (
        <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>
                    {failing.map(check => healthCheckLabels[check]).join(', ')}{' '}
                    {failing.length === 1 ? 'is' : 'are'} unreachable
                </Alert.Title>
            </Alert.Content>
        </Alert>
    );
};

const PageSpinner = () => (
    <div aria-busy="true" className="flex min-h-40 items-center justify-center">
        <Spinner size="sm" />
    </div>
);
