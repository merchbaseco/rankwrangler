import type { PublicOperation } from '@/services/operations.js';
import type {
    HistoryMetricResult,
    ProductHistoryFreshness,
} from '@/services/product-history-agent.js';

export const buildLegacyHistoryResponse = ({
    marketplaceId,
    asin,
    latestImportAt,
    categoryNames,
    points,
    freshness,
}: {
    marketplaceId: string;
    asin: string;
    latestImportAt: string | null;
    categoryNames: Record<string, string>;
    points: HistoryMetricResult['points'];
    freshness: ProductHistoryFreshness;
}) => ({
    marketplaceId,
    asin,
    metric: 'bsrMain' as const,
    categoryNames,
    points,
    freshness: {
        ...freshness,
        updatedAt: freshness.updatedAt ?? latestImportAt,
    },
});

export const buildOperationalLegacyHistoryResponse = ({
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
