import {
	createWSClient,
	httpLink,
	loggerLink,
	splitLink,
	type TRPCWebSocketClient,
	wsLink,
} from "@trpc/client";
import { api } from "@/lib/trpc";

const WS_KEEP_ALIVE_INTERVAL_MS = 10_000;
const WS_KEEP_ALIVE_TIMEOUT_MS = 5_000;

export type WebsiteTrpcRuntime = {
	trpcClient: ReturnType<typeof api.createClient>;
	wsClient: TRPCWebSocketClient;
};

export const createWebsiteTrpcRuntime = ({
	baseUrl,
}: {
	baseUrl: string;
}): WebsiteTrpcRuntime => {
	const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
	const wsClient = createWSClient({
		url: resolveTrpcWebsocketUrl(normalizedBaseUrl),
		lazy: {
			enabled: true,
			closeMs: 1_000,
		},
		keepAlive: {
			enabled: true,
			intervalMs: WS_KEEP_ALIVE_INTERVAL_MS,
			pongTimeoutMs: WS_KEEP_ALIVE_TIMEOUT_MS,
		},
	});

	const trpcClient = api.createClient({
		links: [
			loggerLink({
				enabled: () => import.meta.env.DEV,
			}),
			splitLink({
				condition: isSubscriptionOperation,
				true: wsLink({ client: wsClient }),
				// Unbatched: each read resolves on its own, so a page's grid never waits for
				// a slower aggregate requested in the same tick.
				false: httpLink({
					url: `${normalizedBaseUrl}/api`,
                    fetch: (url, init) => {
                        const headers = new Headers(init?.headers);
                        headers.set('X-Requested-With', 'XMLHttpRequest');
                        return fetch(url, { ...init, headers, credentials: 'include', redirect: 'manual' });
                    },
				}),
			}),
		],
	});

	return { trpcClient, wsClient };
};

export const resolveWebsiteApiBaseUrl = () => {
	const configuredBaseUrl = (import.meta.env.VITE_RANKWRANGLER_API_URL ?? "").replace(
		/\/+$/,
		"",
	);
	if (configuredBaseUrl) {
		return configuredBaseUrl;
	}

	return typeof window === "undefined"
		? "http://localhost:8080"
		: window.location.origin;
};

export const isSubscriptionOperation = (operation: { type: string }) =>
	operation.type === "subscription";

export const resolveTrpcWebsocketUrl = (baseUrl: string) => {
	const url = new URL("/api/trpc", baseUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	return url.toString();
};
