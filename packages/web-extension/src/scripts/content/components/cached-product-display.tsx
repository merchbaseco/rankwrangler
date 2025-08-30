import { useEffect, useState } from 'react';
import { getProduct } from '@/scripts/api/get-product';
import { ProductCache } from '@/scripts/db/product-cache';
import type { Product, ProductIdentifier } from '@/scripts/types/product';
import { ProductDisplay } from './product-display';

export const CachedProductDisplay = (productIdentifier: ProductIdentifier) => {
    const [state, setState] = useState<'loading' | 'success' | 'error' | 'no-data'>('loading');
    const [product, setProduct] = useState<Product>();

    useEffect(() => {
        async function loadBsr() {
            try {
                const cachedProduct = await ProductCache.get(productIdentifier);

                if (cachedProduct) {
                    if (cachedProduct.bsr > 0) {
                        setState('success');
                        setProduct(cachedProduct);
                    } else {
                        setState('no-data'); // Cached "no BSR" result
                    }
                    return;
                }

                // Fetch product info
                const product = await getProduct(productIdentifier);

                if (product.metadata.success) {
                    await ProductCache.set(product);

                    // Update state based on whether BSR exists
                    if (product.bsr) {
                        setState('success');
                        setProduct(product);
                    } else {
                        setState('no-data'); // Valid response, just no BSR
                    }
                } else {
                    throw new Error();
                }
            } catch (_e) {
                setState('error');
            }
        }

        loadBsr();
    }, [productIdentifier]);

    return (
        <ProductDisplay
            product={product}
            isLoading={state === 'loading'}
            isError={state === 'error'}
        />
    );
};
