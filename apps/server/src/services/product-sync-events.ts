export interface ProductSyncCompletedEvent {
    marketplaceId: string;
    asin: string;
}

export type ProductSyncIdentity = Pick<ProductSyncCompletedEvent, 'marketplaceId'>;

type ProductSyncCompletedListener = (event: ProductSyncCompletedEvent) => void;

const completedListeners = new Set<ProductSyncCompletedListener>();

export const notifyProductSyncCompleted = (event: ProductSyncCompletedEvent) => {
    for (const listener of completedListeners) {
        try {
            listener(event);
        } catch (error) {
            console.error('[Product Sync Realtime] Completion listener failed:', error);
        }
    }
};

export const subscribeToProductSyncCompleted = (
    identity: ProductSyncIdentity,
    listener: ProductSyncCompletedListener
) => {
    const matchingListener: ProductSyncCompletedListener = event => {
        if (event.marketplaceId !== identity.marketplaceId) {
            return;
        }

        listener(event);
    };
    completedListeners.add(matchingListener);

    return () => {
        completedListeners.delete(matchingListener);
    };
};
