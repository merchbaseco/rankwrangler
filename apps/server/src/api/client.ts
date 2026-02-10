import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './router.js';

export interface ApiClientOptions {
    apiUrl: string;
    token?: string;
    headers?: Record<string, string>;
}

export const createApiClient = ({ apiUrl, token, headers }: ApiClientOptions) => {
    const normalizedUrl = normalizeApiUrl(apiUrl);

    return createTRPCProxyClient<AppRouter>({
        links: [
            httpBatchLink({
                url: normalizedUrl,
                headers() {
                    return {
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        ...(headers ?? {}),
                    };
                },
            }),
        ],
    });
};

const normalizeApiUrl = (url: string) => {
    const trimmed = url.trim().replace(/\/$/, '');
    if (trimmed.endsWith('/api')) {
        return trimmed;
    }
    return `${trimmed}/api`;
};
