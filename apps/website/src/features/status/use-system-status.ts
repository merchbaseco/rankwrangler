import { api } from '@/lib/trpc';

/** The admin system status, refreshed every 30 seconds while the tab is visible. */
export const useSystemStatus = ({ enabled = true }: { enabled?: boolean } = {}) =>
    api.api.app.system.status.useQuery(undefined, {
        enabled,
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        retry: false,
    });
