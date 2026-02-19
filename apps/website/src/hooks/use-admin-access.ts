import { api } from '@/lib/trpc';

export const useAdminAccess = () => {
    const query = api.api.app.adminStatus.useQuery(undefined, {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 60_000,
    });

    return {
        isAdmin: query.data?.isAdmin ?? false,
        isLoading: query.isLoading,
        errorCode: query.error?.data?.code,
    };
};
