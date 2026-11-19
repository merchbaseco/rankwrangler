import type { ProductIdentity } from '@/db/product/get-products';
import type { AmazonListingStatus } from '@/types';
import { getProducts, type ProductRetrieval } from './product-retrieval';
import { RetrievalRetryableError } from './retrieval-coordinator';

export interface BasicProduct {
    marketplaceId: string;
    asin: string;
    title: string | null;
    /** Amazon's main product image; null when none is known. */
    imageUrl: string | null;
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
        fetchPolicy: 'last-known',
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
        imageUrl:
            retrieval.product?.thumbnail.status === 'available'
                ? retrieval.product.thumbnail.url
                : null,
        amazonListingStatus:
            retrieval.amazonListingStatus === 'deleted' ||
            retrieval.product?.amazonListingStatus === 'deleted'
                ? 'deleted'
                : 'active',
    };
};
