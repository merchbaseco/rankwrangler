import { RateLimiter } from 'limiter';
import log from '@/utils/logger';
import { getErrorProduct, type Product } from '../content/types/product';

const rateLimiter = new RateLimiter({
    tokensPerInterval: 10,
    interval: 'second',
});

interface GetProductParams {
    asin: string;
    marketplaceId: string;
}

const PRODUCT_PARAMS_REQUEST_KEY = 'productParamsRequest';

class StorageQueue {
    private queue: Promise<any> = Promise.resolve();
    
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.queue.then(operation);
        this.queue = result.catch(() => {}); // Continue even if one fails
        return result;
    }
}

const storageQueue = new StorageQueue();

export const getProduct = async (params: GetProductParams): Promise<Product> => {
    const { asin, marketplaceId } = params;

    await recordProductRequestStarted(params);
    await rateLimiter.removeTokens(1);

    return new Promise(resolve => {
        const message = {
            type: 'fetchProductInfo',
            asin,
            marketplaceId,
        };

        chrome.runtime.sendMessage(message, response => {
            recordProductRequestCompleted(params);
            if (chrome.runtime.lastError) {
                log.error(`getProduct failed for ${asin}`, { error: chrome.runtime.lastError });
                resolve(getErrorProduct(asin));
                return;
            }

            if (!response) {
                log.error(`getProduct failed for ${asin}`, {
                    error: 'No response from service worker.',
                });
                resolve(getErrorProduct(asin));
                return;
            }

            if (!response.success) {
                log.error(`getProduct failed for ${asin}`, {
                    error: `Service worker encountered error. ${response.error}`,
                });
                resolve(getErrorProduct(asin));
                return;
            }

            log.success('API response received', response);
            resolve({
                asin,
                bsr: response.data.bsr,
                creationDate: response.data.creationDate,
                metadata: {
                    success: true,
                    lastFetched: new Date().toISOString(),
                    cached: false,
                },
            });
        });
    });
};

const recordProductRequestStarted = async (params: GetProductParams) => {
    return storageQueue.execute(async () => {
        const result = await chrome.storage.local.get([PRODUCT_PARAMS_REQUEST_KEY]);
        const requestQueue = result[PRODUCT_PARAMS_REQUEST_KEY] || {};

        const newRequestQueue = {
            ...requestQueue,
            [params.asin]: {
                ...params,
                startedAt: new Date().toISOString(),
            },
        };

        log.info(`Setting request requestQueue [STARTED ${params.asin}]`, newRequestQueue);
        await chrome.storage.local.set({ [PRODUCT_PARAMS_REQUEST_KEY]: newRequestQueue });
    });
};

const recordProductRequestCompleted = async (params: GetProductParams) => {
    return storageQueue.execute(async () => {
        const result = await chrome.storage.local.get([PRODUCT_PARAMS_REQUEST_KEY]);
        const requestQueue = result[PRODUCT_PARAMS_REQUEST_KEY] || {};
        
        delete requestQueue[params.asin];
        
        log.info(`Setting request requestQueue [COMPLETE ${params.asin}]`, requestQueue);
        await chrome.storage.local.set({ [PRODUCT_PARAMS_REQUEST_KEY]: requestQueue });
    });
};

export const getProductRequestCount = async (): Promise<number> => {
    return storageQueue.execute(async () => {
        const result = await chrome.storage.local.get([PRODUCT_PARAMS_REQUEST_KEY]);
        const requestQueue = result[PRODUCT_PARAMS_REQUEST_KEY] || {};

        return Object.keys(requestQueue).length;
    });
};
