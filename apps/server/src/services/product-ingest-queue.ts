import type { PgBoss } from 'pg-boss';
import { db } from '@/db/index.js';
import { productIngestQueue } from '@/db/schema.js';

type ProductIngestQueueItem = {
    marketplaceId: string;
    asin: string;
};

const PRODUCT_INGEST_QUEUE_JOB = 'process-product-ingest-queue';
const PRODUCT_INGEST_QUEUE_SINGLETON_KEY = 'process-product-ingest-queue';

let productIngestQueueBoss: PgBoss | null = null;

export const registerProductIngestQueueWakeups = (boss: PgBoss) => {
    productIngestQueueBoss = boss;
};

export const enqueueProductIngestQueueItems = async (
    queueItems: ProductIngestQueueItem[]
) => {
    if (queueItems.length === 0) {
        return 0;
    }

    const insertedItems = await db
        .insert(productIngestQueue)
        .values(queueItems)
        .onConflictDoNothing()
        .returning({
            id: productIngestQueue.id,
        });

    if (insertedItems.length > 0) {
        await sendProcessProductIngestQueueJob();
    }

    return insertedItems.length;
};

export const enqueueProductIngestQueueItem = async (queueItem: ProductIngestQueueItem) => {
    return await enqueueProductIngestQueueItems([queueItem]);
};

export const sendProcessProductIngestQueueJob = async ({
    singleton = true,
}: {
    singleton?: boolean;
} = {}) => {
    if (!productIngestQueueBoss) {
        return;
    }

    const sendOptions = singleton
        ? {
              singletonKey: PRODUCT_INGEST_QUEUE_SINGLETON_KEY,
              retryLimit: 0,
          }
        : {
              retryLimit: 0,
          };

    await productIngestQueueBoss.send(
        PRODUCT_INGEST_QUEUE_JOB,
        {},
        sendOptions
    );
};
