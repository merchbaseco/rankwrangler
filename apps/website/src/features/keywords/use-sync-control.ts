import { api } from '@/lib/trpc';
import { useSyncControlChanged } from './use-sync-control-changed';

/**
 * Automatic keyword sync state (`syncControl.get`) and the admin-only toggle
 * (`syncControl.set`). Non-admins read the state; `canManage` gates the toggle.
 * It never polls: `syncControl.changed` refetches it, and a change writes its
 * acknowledged result straight into the cache.
 */
export const useSyncControl = () => {
    useSyncControlChanged();
    const utils = api.useUtils();
    const query = api.api.app.syncControl.get.useQuery(undefined, {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
    });
    const mutation = api.api.app.syncControl.set.useMutation({
        onSuccess: data => utils.api.app.syncControl.get.setData(undefined, data),
    });
    return {
        canManage: query.data?.canManage ?? false,
        error: mutation.error,
        isPending: mutation.isPending,
        paused: query.data?.paused ?? null,
        setPaused: (paused: boolean) => mutation.mutate({ paused }),
    };
};
