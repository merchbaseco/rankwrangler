import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { browser } from "webextension-polyfill-ts";
import { log } from "../../utils/logger";
import { DebugWidget } from "./components/debug-widget";
import { searchInjector } from "./services/search-injector";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			staleTime: 5 * 1000,
		},
	},
});

const App = () => {
	const [debugMode, setDebugMode] = useState(false);

	useEffect(() => {
		log.info("Content script App component mounted");

		// Load initial debug mode state
		browser.storage.local
			.get(["debugMode"])
			.then((result: any) => {
				const initialDebugMode = result.debugMode || false;
				log.debug("Initial debug mode from storage:", {
					debugMode: initialDebugMode,
				});
				setDebugMode(initialDebugMode);
			})
			.catch((error: any) => {
				log.error("Failed to get initial debug mode:", error);
			});

		// Listen for custom event from injected script (immediate response)
		const handleDebugModeChange = (event: CustomEvent) => {
			const newDebugMode = event.detail.debugMode;
			log.info("Debug mode changed via custom event:", {
				debugMode: newDebugMode,
			});
			setDebugMode(newDebugMode);
		};

		window.addEventListener(
			"debugModeChanged",
			handleDebugModeChange as EventListener,
		);

		// Initial injection
		const runInjection = () => {
			log.debug("Running BSR injection");
			searchInjector.injectBsrBadges();
		};

		setTimeout(runInjection, 1000);

		// Watch for URL changes
		let currentUrl = window.location.href;
		const urlChangeHandler = () => {
			if (window.location.href !== currentUrl) {
				log.info("URL changed, re-injecting badges");
				currentUrl = window.location.href;
				searchInjector.reset();
				setTimeout(runInjection, 1000);
			}
		};

		const urlWatcher = setInterval(urlChangeHandler, 1000);

		window.addEventListener("popstate", () => {
			setTimeout(urlChangeHandler, 100);
		});

		return () => {
			clearInterval(urlWatcher);
			window.removeEventListener(
				"debugModeChanged",
				handleDebugModeChange as EventListener,
			);
		};
	}, []);

	// Log debug mode changes
	useEffect(() => {
		log.info("Debug mode state changed to:", { debugMode });
	}, [debugMode]);

	return (
		<QueryClientProvider client={queryClient}>
			{debugMode && <DebugWidget />}
		</QueryClientProvider>
	);
};

export default App;
