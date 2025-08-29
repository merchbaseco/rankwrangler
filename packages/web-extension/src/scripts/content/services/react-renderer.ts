import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Utility service for rendering React components into the DOM
 * Used by services that need to inject React components into existing pages
 */
class ReactRenderer {
    private roots = new Map<HTMLElement, Root>();

    /**
     * Render a React component into a DOM element
     */
    public render(component: ReactElement, container: HTMLElement): void {
        // If we already have a root for this container, use it
        let root = this.roots.get(container);

        if (!root) {
            root = createRoot(container);
            this.roots.set(container, root);
        }

        root.render(component);
    }

    /**
     * Unmount and clean up a rendered component
     */
    public unmount(container: HTMLElement): void {
        const root = this.roots.get(container);
        if (root) {
            root.unmount();
            this.roots.delete(container);
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

    /**
     * Clean up all roots
     */
    public cleanup(): void {
        this.roots.forEach(root => {
            root.unmount();
        });
        this.roots.clear();
    }
}

export const reactRenderer = new ReactRenderer();
