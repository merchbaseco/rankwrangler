export type ProcessSpApiSyncQueueResult = {
    didWork: boolean;
    marketplaceId: string | null;
    queueCount: number;
    upsertedCount: number;
    deletedCount: number;
    hasMore: boolean;
};
