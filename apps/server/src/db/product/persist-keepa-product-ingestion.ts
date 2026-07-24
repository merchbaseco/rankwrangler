import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { operations } from '@/db/schema';
import { buildProductHistoryResource } from '@/db/operations';
import { persistNormalizedKeepaProduct } from './persist-normalized-keepa-product';
import type { NormalizedKeepaProduct } from '@/services/keepa-product-normalizer';

export type KeepaIngestionImport = {
    requestParams: Record<string, unknown>;
    responsePayload: Record<string, unknown> | null;
    tokensConsumed: number | null;
    tokensLeft: number | null;
    refillInMs: number | null;
    refillRate: number | null;
};

export type AcceptedKeepaProductIngestion = NormalizedKeepaProduct & {
    import: KeepaIngestionImport;
    operationId?: string;
};

export const persistAcceptedKeepaProductIngestion = async (
    ingestion: AcceptedKeepaProductIngestion
) => {
    return await db.transaction(async transaction => {
        const persisted = await persistNormalizedKeepaProduct(
            transaction,
            {
                product: ingestion.product,
                historyPoints: ingestion.historyPoints,
            },
            ingestion.import
        );

        if (ingestion.operationId) {
            const completedAt = new Date();
            const completedOperation = await transaction
                .update(operations)
                .set({
                    status: 'completed',
                    resource: buildProductHistoryResource({
                        marketplaceId: ingestion.product.marketplaceId,
                        asin: ingestion.product.asin,
                    }),
                    completedAt,
                    updatedAt: completedAt,
                })
                .where(
                    and(
                        eq(operations.id, ingestion.operationId),
                        eq(operations.status, 'pending')
                    )
                )
                .returning({ id: operations.id });

            if (completedOperation.length !== 1) {
                throw new Error(
                    `Failed to complete Product-history Operation ${ingestion.operationId}`
                );
            }
        }

        return {
            importId: persisted.importId,
            importedAt: persisted.importedAt,
        };
    });
};
