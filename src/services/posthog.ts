import { PostHog } from 'posthog-node';

const client = new PostHog(
    'phc_HOVT8rMHkVhjA1Gz0C3v3CW2UCJuwBDNKSOpe5YQKPZ',
    {
        host: 'https://us.i.posthog.com'
    }
);

/**
 * Track an API request event
 */
export function trackApiRequest(params: {
    uid: string;
    endpoint: string;
    marketplaceId?: string;
    asin?: string;
    asins?: string[];
    cached?: boolean;
}) {
    try {
        client.capture({
            distinctId: params.uid,
            event: 'api_request',
            properties: {
                endpoint: params.endpoint,
                ...(params.marketplaceId && { marketplaceId: params.marketplaceId }),
                ...(params.asin && { asin: params.asin }),
                ...(params.asins && { asinCount: params.asins.length }),
                ...(params.cached !== undefined && { cached: params.cached }),
            }
        });
    } catch (error) {
        // Silently fail - don't break the app if PostHog is down
        console.error('[PostHog] Failed to track API request:', error);
    }
}

/**
 * Track an SP-API call event
 */
export function trackSpApiCall(params: {
    caller: string;
    apiName: string;
}) {
    try {
        client.capture({
            distinctId: params.caller,
            event: 'sp_api_call',
            properties: {
                apiName: params.apiName,
            }
        });
    } catch (error) {
        // Silently fail - don't break the app if PostHog is down
        console.error('[PostHog] Failed to track SP-API call:', error);
    }
}

/**
 * Shutdown PostHog client (call on app shutdown)
 */
export async function shutdownPostHog() {
    await client.shutdown();
}

