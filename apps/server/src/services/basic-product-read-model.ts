import type { ProductGetManyInclude } from '@/api/public/product-input';
import type { ProductIdentity } from '@/db/product/get-products';
import type { AmazonListingStatus } from '@/types';
import {
    getProductListingEnrichments,
    type ProductListingEnrichment,
} from './product-listing-enrichment';
import { getProducts, type ProductRetrieval } from './product-retrieval';
import { RetrievalRetryableError } from './retrieval-coordinator';

export interface BasicProduct {
    marketplaceId: string;
    asin: string;
    title: string | null;
    thumbnail: { status: 'available'; url: string } | { status: 'unavailable' };
    amazonListingStatus: AmazonListingStatus;
}

/** Enrichment fields are present only when the caller passed `include`. */
export type BatchProduct = BasicProduct & Partial<ProductListingEnrichment>;

interface BasicProductReadInput {
    products: ProductIdentity[];
    include?: ProductGetManyInclude[];
    signal?: AbortSignal;
}

export interface BasicProductReadModelDeps {
    getProducts: typeof getProducts;
    getProductListingEnrichments: typeof getProductListingEnrichments;
}

const defaultDeps: BasicProductReadModelDeps = {
    getProducts,
    getProductListingEnrichments,
};

export const getBasicProductReadModels = async (
    input: BasicProductReadInput,
    deps: BasicProductReadModelDeps = defaultDeps
): Promise<BatchProduct[]> => {
    const retrievals = await deps.getProducts({
        products: input.products,
        fetchPolicy: 'last-known',
        signal: input.signal,
    });
    const products = retrievals.map(retrieval => ({
        product: mapBasicProduct(retrieval),
        retrieval,
    }));
    if (!input.include) {
        return products.map(({ product }) => product);
    }

    const enrichments = await deps.getProductListingEnrichments({
        sources: products.map(({ product, retrieval }) => ({
            identity: retrieval.identity,
            product: retrieval.product,
            listingActive: product.amazonListingStatus === 'active',
        })),
        include: input.include,
    });
    return products.map(({ product }, index) => ({ ...product, ...enrichments[index] }));
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
