import type { PgBoss } from 'pg-boss';
import { db } from '@/db/index.js';
import { spApiSyncQueue } from '@/db/schema.js';

type SpApiSyncQueueItem = {
    marketplaceId: string;
    asin: string;
};

const SP_API_SYNC_QUEUE_JOB = 'process-spapi-sync-queue';
const SP_API_SYNC_QUEUE_SINGLETON_KEY = 'process-spapi-sync-queue';

let spApiSyncQueueBoss: PgBoss | null = null;

export const registerSpApiSyncQueueWakeups = (boss: PgBoss) => {
    spApiSyncQueueBoss = boss;
};

export const enqueueSpApiSyncQueueItems = async (
    queueItems: SpApiSyncQueueItem[]
) => {
    if (queueItems.length === 0) {
        return 0;
    }

    const insertedItems = await db
        .insert(spApiSyncQueue)
        .values(queueItems)
        .onConflictDoNothing()
        .returning({
            id: spApiSyncQueue.id,
        });

    if (insertedItems.length > 0) {
        await sendProcessSpApiSyncQueueJob();
    }

    return insertedItems.length;
};

export const enqueueSpApiSyncQueueItem = async (queueItem: SpApiSyncQueueItem) => {
    return await enqueueSpApiSyncQueueItems([queueItem]);
};

export const sendProcessSpApiSyncQueueJob = async ({
    singleton = true,
}: {
    singleton?: boolean;
} = {}) => {
    if (!spApiSyncQueueBoss) {
        return;
    }

    const sendOptions = singleton
        ? {
              singletonKey: SP_API_SYNC_QUEUE_SINGLETON_KEY,
              retryLimit: 0,
          }
        : {
              retryLimit: 0,
          };

    await spApiSyncQueueBoss.send(
        SP_API_SYNC_QUEUE_JOB,
        {},
        sendOptions
    );
};
