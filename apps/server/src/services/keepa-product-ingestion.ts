import {
    persistAcceptedKeepaProductIngestion,
    type KeepaIngestionImport,
} from '@/db/product/persist-keepa-product-ingestion';
import {
    type KeepaProductPayload,
    normalizeKeepaProduct,
} from '@/services/keepa-product-normalizer';

type KeepaProductIngestionDeps = {
    persistAcceptedIngestion: typeof persistAcceptedKeepaProductIngestion;
};

const defaultKeepaProductIngestionDeps: KeepaProductIngestionDeps = {
    persistAcceptedIngestion: persistAcceptedKeepaProductIngestion,
};

export const ingestKeepaProduct = async (
    {
        marketplaceId,
        asin,
        product,
        fetchedAt,
        import: importDetails,
    }: {
        marketplaceId: string;
        asin: string;
        product: KeepaProductPayload;
        fetchedAt: Date;
        import: KeepaIngestionImport;
    },
    deps: KeepaProductIngestionDeps = defaultKeepaProductIngestionDeps
) => {
    const normalized = normalizeKeepaProduct({ marketplaceId, product, fetchedAt });
    if (normalized.product.asin !== asin) {
        throw new Error(
            `Keepa Product ASIN ${normalized.product.asin} does not match ${asin}`
        );
    }

    const persisted = await deps.persistAcceptedIngestion({
        ...normalized,
        import: importDetails,
    });

    return {
        ...persisted,
        normalized,
    };
};
