import { PostHog } from 'posthog-node';
import { env } from '@/config/env';

const client = env.POSTHOG_API_KEY
    ? new PostHog(env.POSTHOG_API_KEY, {
          host: 'https://us.i.posthog.com',
          flushAt: 20, // Flush after 20 events
          flushInterval: 10000, // Flush every 10 seconds
      })
    : null;

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
    if (!client) return;
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
            },
        });
    } catch (error) {
        // Silently fail - don't break the app if PostHog is down
        console.error('[PostHog] Failed to track API request:', error);
    }
}

/**
 * Track an SP-API call event
 */
export function trackSpApiCall(params: { caller: string; apiName: string }) {
    if (!client) return;
    try {
        client.capture({
            distinctId: params.caller,
            event: 'sp_api_call',
            properties: {
                apiName: params.apiName,
            },
        });
    } catch (error) {
        // Silently fail - don't break the app if PostHog is down
        console.error('[PostHog] Failed to track SP-API call:', error);
    }
}

/**
 * Test PostHog connection (returns true if initialized, false otherwise)
 */
export function isPostHogEnabled(): boolean {
    return client !== null;
}

/**
 * Shutdown PostHog client (call on app shutdown)
 */
export async function shutdownPostHog() {
    if (client) {
        await client.shutdown();
    }
}
