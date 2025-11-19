import { SellingPartner as SellingPartnerAPI } from 'amazon-sp-api';
import Bottleneck from 'bottleneck';
import { env } from '@/config/env.js';

// Rate limiter: 2 requests per second with burst of 2 (matches SP-API limits)
export const spApiRateLimiter = new Bottleneck({
    maxConcurrent: 2,
    minTime: 500, // 500ms between requests = 2 per second
    reservoir: 2, // Initial burst capacity
    reservoirRefreshAmount: 2,
    reservoirRefreshInterval: 1000, // Refresh every second
});


export const sellingPartnerApiClient = new SellingPartnerAPI({
    region: 'na',
    refresh_token: env.SPAPI_REFRESH_TOKEN,
    credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: env.SPAPI_CLIENT_ID,
        SELLING_PARTNER_APP_CLIENT_SECRET: env.SPAPI_APP_CLIENT_SECRET,
    },
});

export { searchCatalogItemsByAsins } from './search-catalog-items-by-asins.js';