import { RateLimiter } from 'limiter';
import log from '@/utils/logger';
import { ProductCache } from '../db/product-cache';
import { ProductRequestTracker } from '../db/product-request-tracker';
import { getErrorProduct, type Product, type ProductIdentifier } from '../types/product';

const rateLimiter = new RateLimiter({
    tokensPerInterval: 10,
    interval: 'second',
});

export const getProduct = async (productIdentifier: ProductIdentifier): Promise<Product> => {
    const { asin, marketplaceId } = productIdentifier;

    await ProductRequestTracker.markRequestStarted(productIdentifier);
    await rateLimiter.removeTokens(1);

    return new Promise(resolve => {
        const message = {
            type: 'fetchProductInfo',
            asin,
            marketplaceId,
        };

        chrome.runtime.sendMessage(message, async response => {
            log.info(`getProduct(${asin}) response!`, response.data);
            await ProductRequestTracker.markRequestCompleted(productIdentifier);
            log.info(`getProduct(${asin}) request marked completed.`);

            if (chrome.runtime.lastError) {
                log.error(`getProduct failed for ${asin}`, { error: chrome.runtime.lastError });
                resolve(getErrorProduct(productIdentifier));
                return;
            }

            if (!response) {
                log.error(`getProduct failed for ${asin}`, {
                    error: 'No response from service worker.',
                });
                resolve(getErrorProduct(productIdentifier));
                return;
            }

            if (!response.success) {
                log.error(`getProduct failed for ${asin}`, {
                    error: `Service worker encountered error. ${response.error}`,
                });
                resolve(getErrorProduct(productIdentifier));
                return;
            }

            log.success('API response received', response);
            const product = {
                asin,
                marketplaceId: response.data.marketplaceId,
                bsr: response.data.bsr,
                creationDate: response.data.creationDate,
                metadata: {
                    success: true,
                    lastFetched: new Date().toISOString(),
                    cached: false,
                },
            };

            // Cache the successful response
            await ProductCache.set(product);
            resolve(product);
        });
    });
};
