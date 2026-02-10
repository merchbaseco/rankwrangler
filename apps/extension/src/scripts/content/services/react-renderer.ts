import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { browser } from "webextension-polyfill-ts";
import { log } from "../../../utils/logger";

/**
 * Utility service for rendering React components into the DOM
 * Uses MutationObserver for automatic cleanup when elements are removed
 */
class ReactRenderer {
	private readonly roots = new Map<HTMLElement | ShadowRoot, Root>();
	private readonly observer: MutationObserver;

	constructor() {
		// Set up MutationObserver for automatic cleanup
		this.observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === "childList" && mutation.removedNodes.length > 0) {
					for (const node of mutation.removedNodes) {
						if (node.nodeType === Node.ELEMENT_NODE) {
							this.cleanupRemovedElement(node as HTMLElement);
						}
					}
				}
			}
		});

		// Start observing document.body for removed nodes
		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
		});

		// Initialize roots count in storage
		this.updateRootsCountInStorage();
	}

	/**
	 * Update the roots count in browser.storage.local for popup to read
	 */
	private updateRootsCountInStorage(): void {
		const count = this.roots.size;
		browser.storage.local.set({
			reactRootsCount: {
				count,
				timestamp: Date.now(),
			},
		});
	}

	/**
	 * Check if a removed element or its descendants had React roots and clean them up
	 */
	private cleanupRemovedElement(element: HTMLElement): void {
		let removedCount = 0;

		// Check if this element itself has a root
		const root = this.roots.get(element);
		if (root) {
			log.debug("Auto-unmounting React root from host element");
			root.unmount();
			this.roots.delete(element);
			removedCount++;
		}

		// Check if this element has a shadow root with a React root
		if (element.shadowRoot) {
			const shadowRoot = this.roots.get(element.shadowRoot);
			if (shadowRoot) {
				log.debug("Auto-unmounting React root from shadow root");
				shadowRoot.unmount();
				this.roots.delete(element.shadowRoot);
				removedCount++;
			}
		}

		// Check all descendants for roots (both regular elements and shadow roots)
		this.roots.forEach((rootInstance, container) => {
			if (container instanceof ShadowRoot) {
				// For shadow roots, check if their host element is being removed
				if (element.contains(container.host) || element === container.host) {
					log.debug("Auto-unmounting React root from descendant shadow root");
					rootInstance.unmount();
					this.roots.delete(container);
					removedCount++;
				}
			} else if (element.contains(container)) {
				log.debug("Auto-unmounting React root from descendant element");
				rootInstance.unmount();
				this.roots.delete(container);
				removedCount++;
			}
		});

		// Update storage if any roots were removed
		if (removedCount > 0) {
			this.updateRootsCountInStorage();
		}
	}

	/**
	 * Render a React component into a DOM element or shadow root
	 */
	render(component: ReactElement, container: HTMLElement | ShadowRoot): void {
		// If we already have a root for this container, use it
		let root = this.roots.get(container);
		const isNewRoot = !root;

		if (!root) {
			root = createRoot(container);
			this.roots.set(container, root);
		}

		root.render(component);

		// Update storage if this was a new root
		if (isNewRoot) {
			this.updateRootsCountInStorage();
		}
	}

	/**
	 * Create a new container div for rendering React components
	 */
	createContainer(className?: string): HTMLElement {
		const container = document.createElement("div");
		if (className) {
			container.className = className;
		}
		return container;
	}

	/**
	 * Explicitly cleanup all React roots matching the given selector
	 * Useful for immediate cleanup during navigation
	 */
	forceCleanupBySelector(selector: string): void {
		const elements = document.querySelectorAll<HTMLElement>(selector);
		let removedCount = 0;

		for (const element of elements) {
			// Clean up direct root on the element
			const root = this.roots.get(element);
			if (root) {
				log.debug("Force unmounting React root from element");
				root.unmount();
				this.roots.delete(element);
				removedCount++;
			}

			// Clean up shadow root
			if (element.shadowRoot) {
				const shadowRoot = this.roots.get(element.shadowRoot);
				if (shadowRoot) {
					log.debug("Force unmounting React root from shadow root");
					shadowRoot.unmount();
					this.roots.delete(element.shadowRoot);
					removedCount++;
				}
			}
		}

		// Update storage if any roots were removed
		if (removedCount > 0) {
			this.updateRootsCountInStorage();
		}
	}
}

export const reactRenderer = new ReactRenderer();
