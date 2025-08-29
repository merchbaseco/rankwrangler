import { apiService } from './api';

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
        // Create loading badge
        const badge = this.createBadgeElement(asin, 'loading');
        
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
     * Create a badge HTML element
     */
    private createBadgeElement(asin: string, state: 'loading' | 'success' | 'error', bsr?: number): HTMLElement {
        const badge = document.createElement('div');
        badge.className = 'rw-bsr-badge';
        badge.style.cssText = `
            margin: 4px 0;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            backdrop-filter: blur(4px);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            max-width: fit-content;
            z-index: 1;
            position: relative;
        `;

        switch (state) {
            case 'loading':
                badge.style.background = 'linear-gradient(to right, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05))';
                badge.style.border = '1px solid rgba(59, 130, 246, 0.2)';
                badge.style.color = 'rgb(37, 99, 235)';
                badge.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <div style="width: 10px; height: 10px; border: 2px solid rgba(59, 130, 246, 0.3); border-top-color: rgb(59, 130, 246); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        <span>Loading BSR...</span>
                    </div>
                `;
                break;

            case 'success':
                badge.style.background = 'linear-gradient(to right, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05))';
                badge.style.border = '1px solid rgba(34, 197, 94, 0.2)';
                badge.style.color = 'rgb(21, 128, 61)';
                badge.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="font-weight: 700;">#${bsr?.toLocaleString()}</span>
                        <span style="font-size: 10px; opacity: 0.8;">BSR</span>
                    </div>
                `;
                break;

            case 'error':
                badge.style.background = 'linear-gradient(to right, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))';
                badge.style.border = '1px solid rgba(239, 68, 68, 0.2)';
                badge.style.color = 'rgb(185, 28, 28)';
                badge.innerHTML = '<span>BSR unavailable</span>';
                break;
        }

        return badge;
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
                
                // Replace loading badge with success badge
                const newBadge = this.createBadgeElement(asin, 'success', response.data.bsr);
                badgeInfo.element.replaceWith(newBadge);
                
                // Update badge reference
                this.badges.set(asin, { 
                    element: newBadge, 
                    asin, 
                    isLoading: false 
                });
            } else {
                throw new Error(response.error || 'No BSR data');
            }
        } catch (error) {
            console.error(`[SearchInjector] Error fetching BSR for ASIN ${asin}:`, error);
            
            // Replace loading badge with error badge
            const errorBadge = this.createBadgeElement(asin, 'error');
            badgeInfo.element.replaceWith(errorBadge);
            
            // Update badge reference
            this.badges.set(asin, { 
                element: errorBadge, 
                asin, 
                isLoading: false 
            });

            // Remove from queue on error
            await apiService.updateQueue('remove', asin);
        }
    }

    /**
     * Clear all processed ASINs (for page navigation)
     */
    public reset(): void {
        this.processedAsins.clear();
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