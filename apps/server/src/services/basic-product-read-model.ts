import type { ProductIdentity } from '@/db/product/get-products';
import { getProducts, type ProductRetrieval } from './product-retrieval';
import { RetrievalRetryableError } from './retrieval-coordinator';

export type BasicProduct =
    | {
          marketplaceId: string;
          asin: string;
          status: 'available';
          title: string | null;
          thumbnail: { status: 'available'; url: string } | { status: 'unavailable' };
      }
    | {
          marketplaceId: string;
          asin: string;
          status: 'unavailable';
      };

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
    if (retrieval.availability === 'pending') {
        throw new RetrievalRetryableError(
            'Product details are temporarily unavailable. Retry shortly.'
        );
    }

    if (retrieval.availability === 'unavailable' || !retrieval.product) {
        return {
            ...retrieval.identity,
            status: 'unavailable',
        };
    }

    return {
        ...retrieval.identity,
        status: 'available',
        title: retrieval.product.title,
        thumbnail:
            retrieval.product.thumbnail.status === 'available'
                ? retrieval.product.thumbnail
                : { status: 'unavailable' },
    };
};
