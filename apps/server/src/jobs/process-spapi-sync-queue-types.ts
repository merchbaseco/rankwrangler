export type ProcessSpApiSyncQueueResult = {
    didWork: boolean;
    marketplaceId: string | null;
    queueCount: number;
    upsertedCount: number;
    unavailableCount: number;
    hasMore: boolean;
};
