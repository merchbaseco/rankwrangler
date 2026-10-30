import { credentialHeaders } from './credential-headers';
import { createTRPCProxyClient, httpBatchLink, httpLink } from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { PublicAppRouter } from './app-router';

const TRAILING_SLASHES_REGEX = /\/+$/;

export const DEFAULT_API_BASE_URL = 'https://rankwrangler-api.merchbase.co';

export type AppRouter = PublicAppRouter;

export type RouterInputs = inferRouterInputs<PublicAppRouter>;
export type RouterOutputs = inferRouterOutputs<PublicAppRouter>;

export type PublicRouterInputs = RouterInputs['api']['public'];
export type PublicRouterOutputs = RouterOutputs['api']['public'];

export type RankWranglerClientOptions = {
    baseUrl: string;
    apiKey?: string;
    headers?: Record<string, string>;
    batch?: boolean;
};

type PublicProxyClient = ReturnType<typeof createTRPCProxyClient<PublicAppRouter>>;

export type RankWranglerClient = PublicProxyClient['api']['public'];

export const createRankWranglerClient = ({
    baseUrl,
    apiKey,
    headers,
    batch = true,
}: RankWranglerClientOptions): RankWranglerClient => {
    const url = `${normalizeBaseUrl(baseUrl)}/api`;
    const resolveHeaders = () => ({
        ...(apiKey ? credentialHeaders(apiKey) : {}),
        ...(headers ?? {}),
    });

    if (batch) {
        const client = createTRPCProxyClient<PublicAppRouter>({
            links: [
                httpBatchLink({
                    url,
                    fetch: (input, init) => fetch(input, { ...init, redirect: 'manual' }),
                    headers: resolveHeaders,
                }),
            ],
        });
        return client.api.public;
    }

    const client = createTRPCProxyClient<PublicAppRouter>({
        links: [
            httpLink({
                url,
                fetch: (input, init) => fetch(input, { ...init, redirect: 'manual' }),
                headers: resolveHeaders,
            }),
        ],
    });
    return client.api.public;
};

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(TRAILING_SLASHES_REGEX, '');
