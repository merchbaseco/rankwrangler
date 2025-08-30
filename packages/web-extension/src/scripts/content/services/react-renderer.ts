import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { log } from '../../../utils/logger';

/**
 * Utility service for rendering React components into the DOM
 * Uses MutationObserver for automatic cleanup when elements are removed
 */
class ReactRenderer {
    private roots = new Map<HTMLElement | ShadowRoot, Root>();
    private observer: MutationObserver;

    constructor() {
        // Set up MutationObserver for automatic cleanup
        this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.cleanupRemovedElement(node as HTMLElement);
                        }
                    });
                }
            });
        });

        // Start observing document.body for removed nodes
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initialize roots count in storage
        this.updateRootsCountInStorage();
    }

    /**
     * Update the roots count in chrome.storage.local for popup to read
     */
    private updateRootsCountInStorage(): void {
        const count = this.roots.size;
        chrome.storage.local.set({
            reactRootsCount: {
                count,
                timestamp: Date.now()
            }
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
            log.debug('Auto-unmounting React root');
            root.unmount();
            this.roots.delete(element);
            removedCount++;
        }

        // Check all descendants for roots
        this.roots.forEach((rootInstance, container) => {
            if (element.contains(container)) {
                log.debug('Auto-unmounting React root');
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
    public render(component: ReactElement, container: HTMLElement | ShadowRoot): void {
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
    public createContainer(className?: string): HTMLElement {
        const container = document.createElement('div');
        if (className) {
            container.className = className;
        }
        return container;
    }
}

export const reactRenderer = new ReactRenderer();
