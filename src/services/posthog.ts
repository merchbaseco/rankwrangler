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
    userEmail: string | null;
    endpoint: string;
    marketplaceId?: string;
    asin?: string;
    asins?: string[];
    cached?: boolean;
}) {
    try {
        const distinctId = params.userEmail || 'anonymous';
        
        client.capture({
            distinctId,
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
    userEmail: string | null;
    apiName: string;
    source?: 'user-request' | 'background-job';
}) {
    try {
        const distinctId = params.userEmail || 'background-job';
        
        client.capture({
            distinctId,
            event: 'sp_api_call',
            properties: {
                apiName: params.apiName,
                source: params.source || 'background-job',
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

