export interface CatalogSearchCompletedEvent {
    operationId: string;
    queryId: string;
}

export type CatalogSearchIdentity = Pick<CatalogSearchCompletedEvent, 'queryId'>;

type CatalogSearchCompletedListener = (event: CatalogSearchCompletedEvent) => void;

const completedListeners = new Set<CatalogSearchCompletedListener>();

export const notifyCatalogSearchCompleted = (event: CatalogSearchCompletedEvent) => {
    for (const listener of completedListeners) {
        try {
            listener(event);
        } catch (error) {
            console.error('[Catalog Search Realtime] Completion listener failed:', error);
        }
    }
};

export const subscribeToCatalogSearchCompleted = (
    identity: CatalogSearchIdentity,
    listener: CatalogSearchCompletedListener
) => {
    const matchingListener: CatalogSearchCompletedListener = event => {
        if (event.queryId !== identity.queryId) {
            return;
        }

        listener(event);
    };
    completedListeners.add(matchingListener);

    return () => {
        completedListeners.delete(matchingListener);
    };
};
