import { useAuth } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TRPCWebSocketClient } from "@trpc/client";
import {
	createContext,
	type PropsWithChildren,
	useContext,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	createWebsiteTrpcRuntime,
	resolveWebsiteApiBaseUrl,
} from "@/lib/trpc-client";
import { api } from "./trpc";

type RealtimeConnectionState = "connected" | "reconnecting" | "disconnected";

const RealtimeConnectionContext =
	createContext<RealtimeConnectionState>("reconnecting");

export function TRPCProvider({ children }: PropsWithChildren) {
	const { getToken } = useAuth();
	const [queryClient] = useState(() => new QueryClient());
	const [{ trpcClient, wsClient }] = useState(() =>
		createWebsiteTrpcRuntime({
			baseUrl: resolveWebsiteApiBaseUrl(),
			getToken,
		}),
	);
	const realtimeConnection = useRealtimeConnection(wsClient);

	useEffect(() => {
		return () => {
			wsClient.close().catch(() => undefined);
		};
	}, [wsClient]);

	return (
		<QueryClientProvider client={queryClient}>
			<RealtimeConnectionContext.Provider value={realtimeConnection}>
				<api.Provider client={trpcClient} queryClient={queryClient}>
					{children}
				</api.Provider>
			</RealtimeConnectionContext.Provider>
		</QueryClientProvider>
	);
}

export const useRealtimeReconnect = ({
	enabled,
	onReconnect,
}: {
	enabled: boolean;
	onReconnect: () => Promise<unknown>;
}) => {
	const connection = useContext(RealtimeConnectionContext);
	const previousConnection = useRef(connection);

	useEffect(() => {
		const previous = previousConnection.current;
		previousConnection.current = connection;
		if (enabled && connection === "connected" && previous !== "connected") {
			onReconnect().catch(() => undefined);
		}
	}, [connection, enabled, onReconnect]);
};

const useRealtimeConnection = (
	wsClient: TRPCWebSocketClient,
): RealtimeConnectionState => {
	return useSyncExternalStore(
		(onStoreChange) => {
			const subscription = wsClient.connectionState.subscribe({
				next: onStoreChange,
			});
			return () => {
				subscription.unsubscribe();
			};
		},
		() => toRealtimeConnectionState(wsClient.connectionState.get().state),
		() => "reconnecting",
	);
};

const toRealtimeConnectionState = (
	state: ReturnType<TRPCWebSocketClient["connectionState"]["get"]>["state"],
): RealtimeConnectionState => {
	switch (state) {
		case "pending":
			return "connected";
		case "connecting":
			return "reconnecting";
		case "idle":
			return "disconnected";
		default:
			return "disconnected";
	}
};
