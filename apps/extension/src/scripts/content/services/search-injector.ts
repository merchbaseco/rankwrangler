import { createElement } from "react";
import { US_MARKETPLACE_ID } from "@/scripts/types/marketplace";
import styles from "@/styles/index.css?inline";
import { log } from "../../../utils/logger";
import { CachedProductDisplay } from "../components/cached-product-display";
import { isValidAsin, SEARCH_PRODUCT_SELECTOR } from "../utils/search-products";
import { reactRenderer } from "./react-renderer";

interface BsrBadge {
	element: HTMLElement;
	asin: string;
}

interface InjectionTarget {
	anchor: HTMLElement;
	parent: HTMLElement;
	position: "after" | "before";
}

class SearchInjector {
	private readonly processedProducts = new Set<string>();
	private readonly badges = new Map<string, BsrBadge>();
	private readonly loggedCarouselEvents = new Set<string>();

	/**
	 * Find all products on search pages and inject BSR badges
	 */
	injectBsrBadges(): void {
		const products = this.findSearchProducts();
		log.info(`Injecting ${products.length} BSR badges`);
		const carouselProducts = products.filter((product) =>
			this.isCarouselProduct(product)
		);
		if (carouselProducts.length > 0) {
			log.debug("Carousel products discovered during full scan", {
				carouselCount: carouselProducts.length,
				totalCount: products.length,
			});
		}

		for (const product of products) {
			const asin = product.getAttribute("data-asin");
			if (!isValidAsin(asin)) {
				continue;
			}

			if (this.isProcessed(product)) {
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
		if (!(productKey && this.processedProducts.has(productKey))) {
			return false;
		}

		// Carousel cards are frequently re-rendered. If the badge host was removed,
		// drop the processed key so the card can be re-injected.
		if (!this.hasBadgeHost(element)) {
			this.processedProducts.delete(productKey);
			return false;
		}

		return true;
	}

	/**
	 * Inject a single badge for a specific product element and ASIN
	 */
	injectSingleBadge(product: HTMLElement, asin: string): void {
		const productKey = this.getProductKey(product);
		if (!productKey) {
			this.logCarouselEvent(product, "missing-product-key", asin);
			return;
		}

		if (this.isProcessed(product)) {
			this.logCarouselEvent(product, "already-processed", asin, productKey);
			return;
		}

		if (this.hasBadgeHost(product)) {
			this.processedProducts.add(productKey);
			this.logCarouselEvent(product, "badge-host-exists", asin, productKey);
			return;
		}

		const injectionTarget = this.findInjectionTarget(product);
		if (injectionTarget) {
			this.createAndInjectBadge(asin, injectionTarget);
			this.processedProducts.add(productKey);
			this.logCarouselEvent(product, "injected", asin, productKey);
			return;
		}

		this.logCarouselEvent(
			product,
			"missing-injection-target",
			asin,
			productKey
		);
	}

	/**
	 * Find all search result products with valid ASINs
	 */
	private findSearchProducts(): HTMLElement[] {
		return Array.from(
			document.querySelectorAll<HTMLElement>(SEARCH_PRODUCT_SELECTOR)
		).filter((el) => {
			return isValidAsin(el.getAttribute("data-asin"));
		});
	}

	/**
	 * Check whether a card currently has a RankWrangler badge host.
	 */
	private hasBadgeHost(productElement: HTMLElement): boolean {
		return productElement.querySelector(".rw-bsr-badge") !== null;
	}

	private isCarouselProduct(productElement: HTMLElement): boolean {
		return Boolean(
			productElement.closest(
				'[data-component-type="s-searchgrid-carousel"], .s-searchgrid-carousel, .a-carousel-card'
			)
		);
	}

	private logCarouselEvent(
		productElement: HTMLElement,
		reason: string,
		asin: string,
		productKey?: string
	): void {
		if (!this.isCarouselProduct(productElement)) {
			return;
		}

		const eventKey = `${reason}:${productKey ?? asin}`;
		if (reason !== "injected" && this.loggedCarouselEvents.has(eventKey)) {
			return;
		}

		if (reason !== "injected") {
			this.loggedCarouselEvents.add(eventKey);
		}

		log.debug("Carousel injection diagnostic", {
			reason,
			asin,
			productKey,
			dataUuid: productElement.getAttribute("data-uuid"),
			dataCelWidget: productElement.getAttribute("data-cel-widget"),
			dataIndex: productElement.getAttribute("data-index"),
			hasTitleRecipe: Boolean(
				productElement.querySelector('[data-cy="title-recipe"]')
			),
			hasImageAnchor: Boolean(this.findImageAnchor(productElement)),
			hasBadgeHost: this.hasBadgeHost(productElement),
		});
	}

	/**
	 * Build a stable key to track whether a product card has already been processed.
	 * Amazon can change per-card attributes, so we fallback to index/component-based keys.
	 */
	private getProductKey(productElement: HTMLElement): string | null {
		const asin = productElement.getAttribute("data-asin");
		if (!isValidAsin(asin)) {
			return null;
		}

		const uuid = productElement.getAttribute("data-uuid");
		if (uuid) {
			return `uuid:${asin}:${uuid}`;
		}

		const celWidget = productElement.getAttribute("data-cel-widget");
		if (celWidget?.startsWith("search_result_")) {
			return `cel-widget:${asin}:${celWidget}`;
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
	 * Find the best place to inject the BSR badge.
	 * Priority: directly below product image, then fallback near title.
	 */
	private findInjectionTarget(
		productElement: HTMLElement
	): InjectionTarget | null {
		const imageAnchor = this.findImageAnchor(productElement);
		if (imageAnchor?.parentElement) {
			return {
				anchor: imageAnchor,
				parent: imageAnchor.parentElement,
				position: "after",
			};
		}

		const titleRecipeContainer = productElement.querySelector<HTMLElement>(
			'[data-cy="title-recipe"]'
		);
		if (titleRecipeContainer?.parentElement) {
			return {
				anchor: titleRecipeContainer,
				parent: titleRecipeContainer.parentElement,
				position: "before",
			};
		}

		// Sponsored brand collection cards often expose the body content wrapper.
		// Inserting before it keeps the badge between the product image and details.
		const sponsoredContentWrapper = productElement.querySelector<HTMLElement>(
			'[class*="productWrapper"]'
		);
		if (sponsoredContentWrapper?.parentElement) {
			return {
				anchor: sponsoredContentWrapper,
				parent: sponsoredContentWrapper.parentElement,
				position: "before",
			};
		}

		return null;
	}

	/**
	 * Find a stable anchor around the product image for consistent placement.
	 */
	private findImageAnchor(productElement: HTMLElement): HTMLElement | null {
		const imageContainerSelectors = [
			'[data-cy="image-container"]',
			".s-product-image-container",
			'[data-component-type="s-product-image"]',
			'[class*="imageWrapper"]',
			"img.s-image",
		] as const;

		for (const selector of imageContainerSelectors) {
			const element = productElement.querySelector<HTMLElement>(selector);
			if (!element) {
				continue;
			}

			const stableContainer = element.closest<HTMLElement>(
				'[data-cy="image-container"], .s-product-image-container, [data-component-type="s-product-image"], [class*="imageWrapper"]'
			);

			return stableContainer ?? element;
		}

		// Fallback for ad cards that only expose generic image markup.
		const genericImage = productElement.querySelector<HTMLElement>(
			'img[alt]:not([alt=""])'
		);
		if (!genericImage) {
			return null;
		}

		const genericContainer = genericImage.closest<HTMLElement>(
			'[class*="imageWrapper"], [data-cy="image-container"], .s-product-image-container, [data-component-type="s-product-image"], a'
		);
		return genericContainer ?? genericImage;
	}

	/**
	 * Create and inject a BSR badge for the given ASIN
	 */
	private createAndInjectBadge(
		asin: string,
		injectionTarget: InjectionTarget
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
			mode: "search",
		});
		reactRenderer.render(cachedProductDisplayComponent, shadowRoot);

		const { anchor, parent, position } = injectionTarget;
		if (position === "after") {
			parent.insertBefore(badge, anchor.nextSibling);
		} else {
			parent.insertBefore(badge, anchor);
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
		this.loggedCarouselEvents.clear();

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
