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

class SearchInjector {
	private processedUuids = new Set<string>();
	private badges = new Map<string, BsrBadge>();

	/**
	 * Find all products on search pages and inject BSR badges
	 */
	public injectBsrBadges(): void {
		const products = this.findSearchProducts();
		log.info(`Injecting ${products.length} BSR badges`);

		products.forEach((product) => {
			const asin = product.getAttribute("data-asin");
			const uuid = product.getAttribute("data-uuid");
			if (!asin || !uuid || this.processedUuids.has(uuid)) {
				return;
			}

			this.injectSingleBadge(product, asin);
		});
	}

	/**
	 * Check if an element has already been processed
	 */
	public isProcessed(element: HTMLElement): boolean {
		const uuid = element.getAttribute("data-uuid");
		return uuid ? this.processedUuids.has(uuid) : false;
	}

	/**
	 * Inject a single badge for a specific product element and ASIN
	 */
	public injectSingleBadge(product: HTMLElement, asin: string): void {
		const uuid = product.getAttribute("data-uuid");
		if (!uuid || this.processedUuids.has(uuid)) {
			return;
		}

		const injectionPoint = this.findInjectionPoint(product);
		if (injectionPoint) {
			this.createAndInjectBadge(asin, injectionPoint);
			this.processedUuids.add(uuid);
		}
	}

	/**
	 * Find all search result products with valid ASINs
	 */
	private findSearchProducts(): HTMLElement[] {
		return Array.from(
			document.querySelectorAll<HTMLElement>('[data-asin]:not([data-asin=""])'),
		).filter((el) => {
			const asin = el.getAttribute("data-asin");
			return asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin);
		});
	}

	/**
	 * Find the best place to inject the BSR badge
	 */
	private findInjectionPoint(productElement: HTMLElement): HTMLElement | null {
		const titleRecipeContainer = productElement.querySelector(
			'[data-cy="title-recipe"]',
		);
		return titleRecipeContainer?.parentElement || null;
	}

	/**
	 * Create and inject a BSR badge for the given ASIN
	 */
	private createAndInjectBadge(
		asin: string,
		injectionPoint: HTMLElement,
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
			'[data-cy="title-recipe"]',
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
	 * Clear all processed UUIDs (for page navigation)
	 */
	public reset(): void {
		this.processedUuids.clear();
		this.badges.clear();

		// Explicitly cleanup React roots before removing DOM elements
		reactRenderer.forceCleanupBySelector(".rw-bsr-badge");

		// Remove all existing badges
		document.querySelectorAll(".rw-bsr-badge").forEach((badge) => {
			badge.remove();
		});
	}
}

// Export singleton instance
export const searchInjector = new SearchInjector();
