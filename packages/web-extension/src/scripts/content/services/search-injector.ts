import { createElement } from 'react';
import { CachedSearchBadge } from '../components/cached-search-badge';
import { reactRenderer } from './react-renderer';

interface BsrBadge {
    element: HTMLElement;
    asin: string;
}

class SearchInjector {
    private processedAsins = new Set<string>();
    private badges = new Map<string, BsrBadge>();

    /**
     * Find all products on search pages and inject BSR badges
     */
    public injectBsrBadges(): void {
        const products = this.findSearchProducts();
        console.log(`[SearchInjector] Found ${products.length} products to process`);

        products.forEach(product => {
            const asin = product.getAttribute('data-asin');
            if (!asin || this.processedAsins.has(asin)) {
                return;
            }

            const injectionPoint = this.findInjectionPoint(product);
            if (injectionPoint) {
                this.createAndInjectBadge(asin, injectionPoint);
                this.processedAsins.add(asin);
            }
        });
    }

    /**
     * Find all search result products with valid ASINs
     */
    private findSearchProducts(): HTMLElement[] {
        return Array.from(
            document.querySelectorAll<HTMLElement>('[data-asin]:not([data-asin=""])')
        ).filter(el => {
            const asin = el.getAttribute('data-asin');
            return asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin);
        });
    }

    /**
     * Find the best place to inject the BSR badge
     */
    private findInjectionPoint(productElement: HTMLElement): HTMLElement | null {
        const titleRecipeContainer = productElement.querySelector('[data-cy="title-recipe"]');
        return titleRecipeContainer?.parentElement || null;
    }

    /**
     * Create and inject a BSR badge for the given ASIN
     */
    private createAndInjectBadge(asin: string, injectionPoint: HTMLElement): void {
        // Create container for React component
        const badge = reactRenderer.createContainer('rw-bsr-badge');

        // Render cached search badge component
        const cachedBadgeComponent = createElement(CachedSearchBadge, {
            asin,
        });
        reactRenderer.render(cachedBadgeComponent, badge);

        // Insert before title-recipe
        const titleRecipe = injectionPoint.querySelector('[data-cy="title-recipe"]');
        if (titleRecipe) {
            injectionPoint.insertBefore(badge, titleRecipe);
        } else {
            injectionPoint.insertBefore(badge, injectionPoint.firstChild);
        }

        // Store badge reference
        this.badges.set(asin, { element: badge, asin });
    }

    /**
     * Clear all processed ASINs (for page navigation)
     */
    public reset(): void {
        this.processedAsins.clear();
        this.badges.clear();

        // Remove all existing badges - React roots will be auto-cleaned by MutationObserver
        document.querySelectorAll('.rw-bsr-badge').forEach(badge => badge.remove());
    }

}

// Add CSS animation for loading spinner
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Export singleton instance
export const searchInjector = new SearchInjector();
