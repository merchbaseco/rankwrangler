import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { browser } from "webextension-polyfill-ts";
import { log } from "../../utils/logger";
import { DebugWidget } from "./components/debug-widget";
import { db } from "../db";
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

		// Set up MutationObserver to watch for new products
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				// Check for added nodes with data-asin
				mutation.addedNodes.forEach((node) => {
					if (node.nodeType === Node.ELEMENT_NODE) {
						const element = node as HTMLElement;
						
						// Check if this element or its children have data-asin
						const products = element.matches('[data-asin]') 
							? [element]
							: Array.from(element.querySelectorAll('[data-asin]'));
							
						products.forEach(product => {
							const asin = product.getAttribute('data-asin');
							if (asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin) && !searchInjector.isProcessed(asin)) {
								log.debug(`New product detected: ${asin}`);
								searchInjector.injectSingleBadge(product as HTMLElement, asin);
							}
						});
					}
				});
			});
		});
		
		// Observe entire body for changes
		observer.observe(document.body, {
			childList: true,
			subtree: true
		});
		
		// Initial injection for products already on page
		setTimeout(() => {
			log.debug("Running initial BSR injection");
			searchInjector.injectBsrBadges();
		}, 1000);

		// Handle browser back/forward cache restoration
		const handlePageHide = () => {
			// Close IndexedDB connection before navigation to allow bfcache
			log.info("Page being hidden, closing IndexedDB connection");
			db.close();
		};

		const handlePageShow = async (event: PageTransitionEvent) => {
			if (event.persisted) {
				// Page was restored from bfcache - components are suspended with stale async operations
				log.info("Page restored from cache, forcing complete component refresh");
				
				// Clear all existing components (removes suspended components)
				searchInjector.reset();
				
				// Reopen database connection
				db.open();
				
				// Re-inject fresh components after DB is ready
				setTimeout(() => {
					log.info("Re-injecting fresh BSR badges after back navigation");
					searchInjector.injectBsrBadges();
				}, 100);
				
				queryClient.invalidateQueries();
			}
		};

		window.addEventListener('pagehide', handlePageHide);
		window.addEventListener('pageshow', handlePageShow);

		return () => {
			observer.disconnect();
			window.removeEventListener('pagehide', handlePageHide);
			window.removeEventListener('pageshow', handlePageShow);
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
