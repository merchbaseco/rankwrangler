// @ts-expect-error - SDK doesn't export types properly in package.json
// See: https://github.com/amzn/selling-partner-api-sdk/issues/290
import { CatalogitemsSpApi } from '@amazon-sp-api-release/amazon-sp-api-sdk-js';
import Bottleneck from 'bottleneck';
import { env } from '@/config/env.js';

// Rate limiter: 2 requests per second with burst of 2 (matches SP-API limits)
const spApiRateLimiter = new Bottleneck({
    maxConcurrent: 2,
    minTime: 500, // 500ms between requests = 2 per second
    reservoir: 2, // Initial burst capacity
    reservoirRefreshAmount: 2,
    reservoirRefreshInterval: 1000, // Refresh every second
});

// Initialize Catalog Items API client
const catalogApiClient = new CatalogitemsSpApi.ApiClient('https://sellingpartnerapi-na.amazon.com');
const catalogApi = new CatalogitemsSpApi.CatalogApi(catalogApiClient);

// Enable automatic access token retrieval
catalogApiClient.enableAutoRetrievalAccessToken(
    env.SPAPI_CLIENT_ID,
    env.SPAPI_APP_CLIENT_SECRET,
    env.SPAPI_REFRESH_TOKEN,
    null
);

export { catalogApi, spApiRateLimiter };
export { searchCatalogItemsByAsins } from './search-catalog-items-by-asins.js';
export { searchCatalogItemsByKeyword } from './search-catalog-items-by-keyword.js';
