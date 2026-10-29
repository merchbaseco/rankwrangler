import { api } from '@/lib/trpc';

/** Refetches sync control when another session or a worker pauses or resumes sync. */
export const useSyncControlChanged = () => {
    const utils = api.useUtils();
    api.api.app.syncControl.changed.useSubscription(undefined, {
        onData: () => {
            utils.api.app.syncControl.get.invalidate().catch(() => undefined);
        },
    });
};
