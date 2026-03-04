// @ts-expect-error - SDK doesn't export types properly in package.json
import { ReportsSpApi } from '@amazon-sp-api-release/amazon-sp-api-sdk-js';
import { ensureAccessTokenFreshness as ensureSpApiAccessTokenFreshness } from '@/services/spapi/spapi-access-token.js';

export class SpApiClient {
    readonly reports: InstanceType<typeof ReportsSpApi.ApiClient>;

    constructor() {
        this.reports = new ReportsSpApi.ApiClient('https://sellingpartnerapi-na.amazon.com');
        // Disable SDK's built-in limiter because it can drop requests under load.
        // Our own Bottleneck limiter should queue and wait for the next slot.
        this.reports.disableRateLimiter();
        this.reports.timeout = 45_000;
    }

    ensureAccessTokenFreshness = async () => {
        await ensureSpApiAccessTokenFreshness(this.reports);
    };

    fetchWithTimeout = async (url: string, timeoutMs: number) => {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

        try {
            return await fetch(url, { signal: controller.signal });
        } catch (error) {
            if (this.isAbortError(error)) {
                throw new Error(`Request timed out after ${timeoutMs}ms.`);
            }

            throw error;
        } finally {
            clearTimeout(timeoutHandle);
        }
    };

    private isAbortError = (error: unknown) => {
        return (
            error instanceof Error &&
            (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
        );
    };
}

export const createSpApiClient = () => {
    return new SpApiClient();
};
