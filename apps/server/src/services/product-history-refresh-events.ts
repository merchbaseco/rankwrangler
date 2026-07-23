export interface ProductHistoryRefreshCompletedEvent {
    operationId: string;
    marketplaceId: string;
    asin: string;
}

export type ProductHistoryRefreshIdentity = Pick<
    ProductHistoryRefreshCompletedEvent,
    'marketplaceId' | 'asin'
>;

type ProductHistoryRefreshCompletedListener = (event: ProductHistoryRefreshCompletedEvent) => void;

const completedListeners = new Set<ProductHistoryRefreshCompletedListener>();

export const notifyProductHistoryRefreshCompleted = (
    event: ProductHistoryRefreshCompletedEvent
) => {
    for (const listener of completedListeners) {
        try {
            listener(event);
        } catch (error) {
            console.error('[Product History Realtime] Completion listener failed:', error);
        }
    }
};

export const subscribeToProductHistoryRefreshCompleted = (
    identity: ProductHistoryRefreshIdentity,
    listener: ProductHistoryRefreshCompletedListener
) => {
    const matchingListener: ProductHistoryRefreshCompletedListener = event => {
        if (event.marketplaceId !== identity.marketplaceId || event.asin !== identity.asin) {
            return;
        }

        listener(event);
    };
    completedListeners.add(matchingListener);

    return () => {
        completedListeners.delete(matchingListener);
    };
};
