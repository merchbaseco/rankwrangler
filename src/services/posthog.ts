import { PostHog } from 'posthog-node';
import { env } from '@/config/env';

const client = env.POSTHOG_API_KEY
    ? new PostHog(env.POSTHOG_API_KEY, {
          host: 'https://us.i.posthog.com',
          flushAt: 20, // Flush after 20 events
          flushInterval: 10000, // Flush every 10 seconds
      })
    : null;

// Log PostHog initialization status
if (client) {
    console.log('[PostHog] Client initialized successfully');
    console.log(
        `[PostHog] API Key: ${env.POSTHOG_API_KEY?.substring(0, 10)}... (${env.POSTHOG_API_KEY?.length} chars)`
    );
} else {
    console.warn('[PostHog] Client not initialized - POSTHOG_API_KEY is missing or empty');
}

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
    if (!client) {
        console.warn('[PostHog] trackApiRequest called but client is not initialized');
        return;
    }
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
        console.log(`[PostHog] Tracked api_request event for ${params.uid} on ${params.endpoint}`);
    } catch (error) {
        // Silently fail - don't break the app if PostHog is down
        console.error('[PostHog] Failed to track API request:', error);
    }
}

/**
 * Track an SP-API call event
 */
export function trackSpApiCall(params: { caller: string; apiName: string }) {
    if (!client) {
        console.warn('[PostHog] trackSpApiCall called but client is not initialized');
        return;
    }
    try {
        client.capture({
            distinctId: params.caller,
            event: 'sp_api_call',
            properties: {
                apiName: params.apiName,
            },
        });
        console.log(
            `[PostHog] Tracked sp_api_call event for ${params.caller} calling ${params.apiName}`
        );
    } catch (error) {
        // Silently fail - don't break the app if PostHog is down
        console.error('[PostHog] Failed to track SP-API call:', error);
    }
}

/**
 * Test PostHog connection by sending a test event
 */
export async function testPostHog() {
    if (!client) {
        console.warn('[PostHog] Test skipped - client not initialized');
        return false;
    }
    try {
        client.capture({
            distinctId: 'test',
            event: 'posthog_test',
            properties: {
                timestamp: new Date().toISOString(),
            },
        });
        // Force flush to send immediately
        await client.flush();
        console.log('[PostHog] Test event sent successfully');
        return true;
    } catch (error) {
        console.error('[PostHog] Test failed:', error);
        return false;
    }
}

/**
 * Shutdown PostHog client (call on app shutdown)
 */
export async function shutdownPostHog() {
    if (client) {
        await client.shutdown();
    }
}
