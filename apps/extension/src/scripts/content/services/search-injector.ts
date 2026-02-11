import { createElement } from "react";
import { US_MARKETPLACE_ID } from "@/scripts/types/marketplace";
import styles from "@/styles/index.css?inline";
import { log } from "../../../utils/logger";
import { CachedProductDisplay } from "../components/cached-product-display";
import { reactRenderer } from "./react-renderer";

interface BsrBadge {
	element: HTMLElement;
	asin: string;
}

const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const SEARCH_RESULT_SELECTOR =
	'[data-component-type="s-search-result"][data-asin]:not([data-asin=""])';

class SearchInjector {
	private readonly processedProducts = new Set<string>();
	private readonly badges = new Map<string, BsrBadge>();

	/**
	 * Find all products on search pages and inject BSR badges
	 */
	injectBsrBadges(): void {
		const products = this.findSearchProducts();
		log.info(`Injecting ${products.length} BSR badges`);

		for (const product of products) {
			const asin = product.getAttribute("data-asin");
			const productKey = this.getProductKey(product);
			if (!(asin && productKey) || this.processedProducts.has(productKey)) {
				continue;
			}

			this.injectSingleBadge(product, asin);
		}
	}

	/**
	 * Check if an element has already been processed
	 */
	isProcessed(element: HTMLElement): boolean {
		const productKey = this.getProductKey(element);
		return productKey ? this.processedProducts.has(productKey) : false;
	}

	/**
	 * Inject a single badge for a specific product element and ASIN
	 */
	injectSingleBadge(product: HTMLElement, asin: string): void {
		const productKey = this.getProductKey(product);
		if (!productKey || this.processedProducts.has(productKey)) {
			return;
		}

		const injectionPoint = this.findInjectionPoint(product);
		if (injectionPoint) {
			this.createAndInjectBadge(asin, injectionPoint);
			this.processedProducts.add(productKey);
		}
	}

	/**
	 * Find all search result products with valid ASINs
	 */
	private findSearchProducts(): HTMLElement[] {
		return Array.from(
			document.querySelectorAll<HTMLElement>(SEARCH_RESULT_SELECTOR)
		).filter((el) => {
			const asin = el.getAttribute("data-asin");
			return asin && asin.length === 10 && ASIN_REGEX.test(asin);
		});
	}

	/**
	 * Build a stable key to track whether a product card has already been processed.
	 * Amazon can change per-card attributes, so we fallback to index/component-based keys.
	 */
	private getProductKey(productElement: HTMLElement): string | null {
		const asin = productElement.getAttribute("data-asin");
		if (!(asin && ASIN_REGEX.test(asin))) {
			return null;
		}

		const uuid = productElement.getAttribute("data-uuid");
		if (uuid) {
			return `uuid:${uuid}`;
		}

		const index = productElement.getAttribute("data-index");
		if (index) {
			return `asin-index:${asin}:${index}`;
		}

		const componentId = productElement.getAttribute("data-component-id");
		if (componentId) {
			return `asin-component:${asin}:${componentId}`;
		}

		return `asin:${asin}`;
	}

	/**
	 * Find the best place to inject the BSR badge
	 */
	private findInjectionPoint(productElement: HTMLElement): HTMLElement | null {
		const titleRecipeContainer = productElement.querySelector(
			'[data-cy="title-recipe"]'
		);
		return titleRecipeContainer?.parentElement || null;
	}

	/**
	 * Create and inject a BSR badge for the given ASIN
	 */
	private createAndInjectBadge(
		asin: string,
		injectionPoint: HTMLElement
	): void {
		// Create container for React component
		const badge = reactRenderer.createContainer("rw-bsr-badge");

		// Style the host element to take full width
		badge.style.display = "block";
		badge.style.width = "100%";

		// Create shadow root and inject styles
		const shadowRoot = badge.attachShadow({ mode: "open" });

		// Inject styles into shadow root
		const styleElement = document.createElement("style");
		styleElement.textContent = styles.toString();
		shadowRoot.appendChild(styleElement);

		// Render cached search badge component into shadow root
		const cachedProductDisplayComponent = createElement(CachedProductDisplay, {
			asin,
			marketplaceId: US_MARKETPLACE_ID,
		});
		reactRenderer.render(cachedProductDisplayComponent, shadowRoot);

		// Insert before title-recipe
		const titleRecipe = injectionPoint.querySelector(
			'[data-cy="title-recipe"]'
		);
		if (titleRecipe) {
			injectionPoint.insertBefore(badge, titleRecipe);
		} else {
			injectionPoint.insertBefore(badge, injectionPoint.firstChild);
		}

		// Store badge reference
		this.badges.set(asin, { element: badge, asin });
	}

	/**
	 * Clear all processed product keys (for page navigation)
	 */
	reset(): void {
		this.processedProducts.clear();
		this.badges.clear();

		// Explicitly cleanup React roots before removing DOM elements
		reactRenderer.forceCleanupBySelector(".rw-bsr-badge");

		// Remove all existing badges
		for (const badge of document.querySelectorAll(".rw-bsr-badge")) {
			badge.remove();
		}
	}
}

// Export singleton instance
export const searchInjector = new SearchInjector();
