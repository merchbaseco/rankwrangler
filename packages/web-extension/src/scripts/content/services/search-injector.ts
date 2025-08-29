import { createElement } from 'react';
import { SearchBadge } from '../components/search-badge';
import { apiService } from './api';
import { reactRenderer } from './react-renderer';

interface BsrBadge {
    element: HTMLElement;
    asin: string;
    isLoading: boolean;
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

        // Render loading state
        const loadingComponent = createElement(SearchBadge, {
            asin,
            state: 'loading',
        });
        reactRenderer.render(loadingComponent, badge);

        // Insert before title-recipe
        const titleRecipe = injectionPoint.querySelector('[data-cy="title-recipe"]');
        if (titleRecipe) {
            injectionPoint.insertBefore(badge, titleRecipe);
        } else {
            injectionPoint.insertBefore(badge, injectionPoint.firstChild);
        }

        // Store badge reference
        this.badges.set(asin, { element: badge, asin, isLoading: true });

        // Fetch BSR data
        this.fetchAndUpdateBadge(asin);
    }

    /**
     * Fetch BSR data and update the badge
     */
    private async fetchAndUpdateBadge(asin: string): Promise<void> {
        const badgeInfo = this.badges.get(asin);
        if (!badgeInfo) return;

        try {
            console.log(`[SearchInjector] Fetching BSR for ASIN: ${asin}`);

            // Add to queue
            await apiService.updateQueue('add', asin);

            // Fetch product info
            const response = await apiService.fetchProductInfo(asin);

            // Remove from queue
            await apiService.updateQueue('remove', asin);

            if (response.success && response.data?.bsr) {
                console.log(`[SearchInjector] Got BSR ${response.data.bsr} for ASIN: ${asin}`);

                // Update badge to success state
                const successComponent = createElement(SearchBadge, {
                    asin,
                    state: 'success',
                    bsr: response.data.bsr,
                });
                reactRenderer.render(successComponent, badgeInfo.element);

                // Update badge reference
                badgeInfo.isLoading = false;
            } else {
                throw new Error(response.error || 'No BSR data');
            }
        } catch (error) {
            console.error(`[SearchInjector] Error fetching BSR for ASIN ${asin}:`, error);

            // Update badge to error state
            const errorComponent = createElement(SearchBadge, {
                asin,
                state: 'error',
            });
            reactRenderer.render(errorComponent, badgeInfo.element);

            // Update badge reference
            badgeInfo.isLoading = false;

            // Remove from queue on error
            await apiService.updateQueue('remove', asin);
        }
    }

    /**
     * Clear all processed ASINs (for page navigation)
     */
    public reset(): void {
        this.processedAsins.clear();

        // Clean up React components
        this.badges.forEach(badgeInfo => {
            reactRenderer.unmount(badgeInfo.element);
        });
        this.badges.clear();

        // Remove all existing badges
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
