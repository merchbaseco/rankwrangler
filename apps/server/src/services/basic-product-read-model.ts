import type { ProductIdentity } from '@/db/product/get-products';
import type { AmazonListingStatus } from '@/types';
import { getProducts, type ProductRetrieval } from './product-retrieval';
import { RetrievalRetryableError } from './retrieval-coordinator';

export interface BasicProduct {
    marketplaceId: string;
    asin: string;
    title: string | null;
    thumbnail: { status: 'available'; url: string } | { status: 'unavailable' };
    amazonListingStatus: AmazonListingStatus;
}

interface BasicProductReadInput {
    products: ProductIdentity[];
    signal?: AbortSignal;
}

export interface BasicProductReadModelDeps {
    getProducts: typeof getProducts;
}

const defaultDeps: BasicProductReadModelDeps = {
    getProducts,
};

export const getBasicProductReadModels = async (
    input: BasicProductReadInput,
    deps: BasicProductReadModelDeps = defaultDeps
): Promise<BasicProduct[]> => {
    const products = await deps.getProducts({
        products: input.products,
        fetchPolicy: 'blocking',
        signal: input.signal,
    });

    return products.map(mapBasicProduct);
};

const mapBasicProduct = (retrieval: ProductRetrieval): BasicProduct => {
    if (retrieval.amazonListingStatus === 'pending') {
        throw new RetrievalRetryableError(
            'Product details are temporarily unavailable. Retry shortly.'
        );
    }

    return {
        ...retrieval.identity,
        title: retrieval.product?.title ?? null,
        thumbnail:
            retrieval.product?.thumbnail.status === 'available'
                ? retrieval.product.thumbnail
                : { status: 'unavailable' },
        amazonListingStatus:
            retrieval.amazonListingStatus === 'deleted' ||
            retrieval.product?.amazonListingStatus === 'deleted'
                ? 'deleted'
                : 'active',
    };
};
