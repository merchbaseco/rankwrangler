import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { browser } from "webextension-polyfill-ts";
import { log } from "../../utils/logger";
import { db } from "../db";
import { DebugWidget } from "./components/debug-widget";
import { productDetailInjector } from "./services/product-detail-injector";
import { searchInjector } from "./services/search-injector";
import {
	getSearchProductsFromMutationNode,
	isValidAsin,
} from "./utils/search-products";

const SEARCH_MUTATION_ATTRIBUTE_FILTER = [
	"data-asin",
	"data-cel-widget",
	"data-component-type",
] as const;

const isCarouselProduct = (element: HTMLElement): boolean => {
	return Boolean(
		element.closest(
			'[data-component-type="s-searchgrid-carousel"], .s-searchgrid-carousel, .a-carousel-card'
		)
	);
};

const handleProductElement = (product: HTMLElement) => {
	const asin = product.getAttribute("data-asin");
	if (!isValidAsin(asin)) {
		return;
	}

	if (searchInjector.isProcessed(product)) {
		return;
	}

	log.debug(`New product detected: ${asin}`);
	searchInjector.injectSingleBadge(product, asin);
};

const handleAttributeMutation = (mutation: MutationRecord) => {
	if (mutation.type !== "attributes") {
		return;
	}

	const target = mutation.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}

	const products = getSearchProductsFromMutationNode(target);
	if (products.length === 0) {
		return;
	}

	if (products.some((product) => isCarouselProduct(product))) {
		log.debug("Search product candidate found via attribute mutation", {
			attributeName: mutation.attributeName,
			candidateCount: products.length,
			targetAsin: target.getAttribute("data-asin"),
			targetCelWidget: target.getAttribute("data-cel-widget"),
		});
	}

	for (const product of products) {
		handleProductElement(product);
	}
};

const handleAddedNode = (node: Node) => {
	if (node.nodeType !== Node.ELEMENT_NODE) {
		return;
	}

	const element = node as HTMLElement;
	for (const product of getSearchProductsFromMutationNode(element)) {
		handleProductElement(product);
	}
};

const handleSearchMutations = (mutations: MutationRecord[]) => {
	for (const mutation of mutations) {
		if (mutation.type === "attributes") {
			handleAttributeMutation(mutation);
			continue;
		}

		for (const node of mutation.addedNodes) {
			handleAddedNode(node);
		}
	}
};

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
				const initialDebugMode = result.debugMode;
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
			handleDebugModeChange as EventListener
		);

		// Check if we're on a product detail page or search page
		const isProductDetailPage = productDetailInjector.isProductDetailPage();

		// Set up MutationObserver to watch for new products (search pages only)
		const observer = new MutationObserver((mutations) => {
			// Only observe for search pages
			if (isProductDetailPage) {
				return;
			}

			handleSearchMutations(mutations);
		});

		// Observe entire body for changes
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: [...SEARCH_MUTATION_ATTRIBUTE_FILTER],
		});

		// Initial injection based on page type
		if (isProductDetailPage) {
			log.debug("Running initial BSR injection for product detail page");
			// Use a small delay to ensure the target element exists
			const tryInject = () => {
				const targetDiv = document.getElementById(
					"alternativeOfferEligibilityMessaging_feature_div"
				);
				if (targetDiv) {
					productDetailInjector.injectBsrBadge();
				} else {
					// Retry after a short delay if element not found
					setTimeout(tryInject, 100);
				}
			};
			tryInject();
		} else {
			log.debug("Running initial BSR injection for search page");
			searchInjector.injectBsrBadges();
		}

		// Handle browser back/forward cache restoration
		const handlePageHide = () => {
			// Close IndexedDB connection before navigation to allow bfcache
			log.info("Page being hidden, closing IndexedDB connection");
			db.close();
		};

		const handlePageShow = (event: PageTransitionEvent) => {
			if (event.persisted) {
				// Page was restored from bfcache - components are suspended with stale async operations
				log.info(
					"Page restored from cache, forcing complete component refresh"
				);

				// Clear all existing components (removes suspended components)
				searchInjector.reset();
				productDetailInjector.reset();

				// Reopen database connection
				db.open();

				// Re-inject fresh components immediately after DB is ready
				const isProductDetail = productDetailInjector.isProductDetailPage();
				if (isProductDetail) {
					log.info("Re-injecting fresh BSR badge for product detail page");
					const tryInject = () => {
						const targetDiv = document.getElementById(
							"alternativeOfferEligibilityMessaging_feature_div"
						);
						if (targetDiv) {
							productDetailInjector.injectBsrBadge();
						} else {
							setTimeout(tryInject, 100);
						}
					};
					tryInject();
				} else {
					log.info("Re-injecting fresh BSR badges for search page");
					searchInjector.injectBsrBadges();
				}

				queryClient.invalidateQueries();
			}
		};

		window.addEventListener("pagehide", handlePageHide);
		window.addEventListener("pageshow", handlePageShow);

		// Handle product detail page injection when target div appears
		// This handles both initial load and SPA navigation
		const productDetailObserver = new MutationObserver(() => {
			if (productDetailInjector.isProductDetailPage()) {
				const targetDiv = document.getElementById(
					"alternativeOfferEligibilityMessaging_feature_div"
				);
				if (targetDiv && !productDetailInjector.hasInjected()) {
					// Target div exists and we haven't injected yet
					productDetailInjector.injectBsrBadge();
				}
			} else if (productDetailInjector.hasInjected()) {
				// Not on product detail page, reset if needed
				productDetailInjector.reset();
			}
		});

		// Observe body for changes (target div may appear after initial load)
		productDetailObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});

		return () => {
			observer.disconnect();
			productDetailObserver.disconnect();
			window.removeEventListener("pagehide", handlePageHide);
			window.removeEventListener("pageshow", handlePageShow);
			window.removeEventListener(
				"debugModeChanged",
				handleDebugModeChange as EventListener
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
