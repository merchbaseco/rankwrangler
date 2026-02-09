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

/**
 * Extract ASIN from Amazon product detail page URL
 * Supports formats:
 * - /dp/B0XXXXXXXXX
 * - /product-name/dp/B0XXXXXXXXX
 * - /gp/product/B0XXXXXXXXX
 */
function extractAsinFromUrl(): string | null {
	const url = window.location.href;
	const patterns = [
		/\/dp\/([A-Z0-9]{10})/,
		/\/gp\/product\/([A-Z0-9]{10})/,
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match && match[1]) {
			const asin = match[1];
			if (asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin)) {
				return asin;
			}
		}
	}

	return null;
}

class ProductDetailInjector {
	private badge: BsrBadge | null = null;
	private injectedAsin: string | null = null;

	/**
	 * Check if we're on a product detail page
	 */
	public isProductDetailPage(): boolean {
		return /\/dp\/|\/gp\/product\//.test(window.location.pathname);
	}

	/**
	 * Check if a badge has been injected
	 */
	public hasInjected(): boolean {
		return this.badge !== null;
	}

	/**
	 * Inject BSR badge on product detail page
	 */
	public injectBsrBadge(): void {
		const asin = extractAsinFromUrl();
		if (!asin) {
			log.debug("Could not extract ASIN from URL");
			return;
		}

		// Check if we've already injected for this ASIN
		if (this.injectedAsin === asin && this.badge) {
			log.debug(`BSR badge already injected for ASIN: ${asin}`);
			return;
		}

		// If ASIN changed, reset the old badge
		if (this.badge && this.injectedAsin !== asin) {
			log.debug(`ASIN changed from ${this.injectedAsin} to ${asin}, resetting badge`);
			this.reset();
		}

		const injectionPoint = this.findInjectionPoint();
		if (!injectionPoint) {
			log.debug("Could not find injection point on product detail page");
			return;
		}

		this.createAndInjectBadge(asin, injectionPoint);
		this.injectedAsin = asin;
	}

	/**
	 * Find the injection point (above alternativeOfferEligibilityMessaging_feature_div)
	 */
	private findInjectionPoint(): HTMLElement | null {
		const targetDiv = document.getElementById(
			"alternativeOfferEligibilityMessaging_feature_div",
		);
		if (!targetDiv) {
			return null;
		}

		// Return the parent element so we can insert before the target div
		return targetDiv.parentElement;
	}

	/**
	 * Create and inject a BSR badge for the given ASIN
	 */
	private createAndInjectBadge(
		asin: string,
		injectionPoint: HTMLElement,
	): void {
		// Create container for React component
		const badge = reactRenderer.createContainer("rw-product-detail-badge");

		// Style the host element to take full width
		badge.style.display = "block";
		badge.style.width = "100%";
		badge.style.marginTop = "16px";
		badge.style.marginBottom = "16px";

		// Create shadow root and inject styles
		const shadowRoot = badge.attachShadow({ mode: "open" });

		// Inject styles into shadow root
		const styleElement = document.createElement("style");
		styleElement.textContent = styles.toString();
		shadowRoot.appendChild(styleElement);

		// Render cached product display component into shadow root
		const cachedProductDisplayComponent = createElement(CachedProductDisplay, {
			asin,
			marketplaceId: US_MARKETPLACE_ID,
		});
		reactRenderer.render(cachedProductDisplayComponent, shadowRoot);

		// Find the target div and insert before it
		const targetDiv = document.getElementById(
			"alternativeOfferEligibilityMessaging_feature_div",
		);
		if (targetDiv) {
			injectionPoint.insertBefore(badge, targetDiv);
		} else {
			// Fallback: append to injection point
			injectionPoint.appendChild(badge);
		}

		// Store badge reference
		this.badge = { element: badge, asin };
		log.info(`Injected BSR badge for ASIN: ${asin} on product detail page`);
	}

	/**
	 * Clear the injected badge (for page navigation)
	 */
	public reset(): void {
		if (this.badge) {
			// Explicitly cleanup React root before removing DOM element
			if (this.badge.element.shadowRoot) {
				reactRenderer.forceCleanupBySelector(".rw-product-detail-badge");
			}
			this.badge.element.remove();
			this.badge = null;
		}
		this.injectedAsin = null;
	}
}

// Export singleton instance
export const productDetailInjector = new ProductDetailInjector();

