import { api } from '@/lib/trpc';

/** Products per Keepa and SP-API refresh tier; tier counts move slowly, so once a minute. */
export const useRefreshTiers = () =>
    api.api.app.system.refreshTiers.useQuery(undefined, {
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        retry: false,
    });
