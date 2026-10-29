import { api } from '@/lib/trpc';

export const useCollectionStatus = () =>
    api.api.app.collectionStatus.useQuery(undefined, {
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        retry: false,
    });
