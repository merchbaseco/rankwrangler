import type { PublicOperation } from '@/services/operations.js';
import type { HistoryMetricResult } from '@/services/product-history-agent.js';

export const buildLegacyHistoryResponse = ({
    marketplaceId,
    asin,
    latestImportAt,
    categoryNames,
    points,
    syncTriggered,
    operation,
}: {
    marketplaceId: string;
    asin: string;
    latestImportAt: string | null;
    categoryNames: Record<string, string>;
    points: HistoryMetricResult['points'];
    syncTriggered: boolean;
    operation: PublicOperation | null;
}) => ({
    marketplaceId,
    asin,
    metric: 'bsrMain' as const,
    latestImportAt,
    categoryNames,
    points,
    collecting: operation?.status === 'pending',
    syncTriggered,
    operation,
});
