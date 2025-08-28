import { useCallback, useEffect, useRef } from 'react';
import { apiService } from '../services/api';

interface ProductObserverCallbacks {
    onProductAdded: (asin: string, element: HTMLElement) => void;
    onProductRemoved: (asin: string, element: HTMLElement) => void;
    onPageChanged: () => void;
}

/**
 * Hook for observing Amazon product elements on the page
 * Watches for new products being added/removed and page navigation changes
 */
export function useProductObserver(callbacks: ProductObserverCallbacks) {
    const observerRef = useRef<MutationObserver | null>(null);
    const currentUrlRef = useRef<string>(window.location.href);
    const processedProductsRef = useRef<Set<string>>(new Set());

    const findProductElements = useCallback((): HTMLElement[] => {
        // Amazon search result selectors
        return Array.from(
            document.querySelectorAll<HTMLElement>(
                '[data-asin]:not([data-asin=""]), [data-index]:not([data-index=""])'
            )
        ).filter(el => {
            const asin = el.getAttribute('data-asin');
            // Amazon ASINs are typically 10 characters long and alphanumeric
            return asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin);
        });
    }, []);

    const handleProductAdded = useCallback(
        (element: HTMLElement) => {
            const asin = element.getAttribute('data-asin');
            if (!asin || processedProductsRef.current.has(asin)) return;

            // Check if this product already has a BSR display
            const existingDisplay = element.querySelector('.rw-container');
            if (existingDisplay) return;

            processedProductsRef.current.add(asin);
            callbacks.onProductAdded(asin, element);
        },
        [callbacks]
    );

    const handleProductRemoved = useCallback(
        (element: HTMLElement) => {
            const asin = element.getAttribute('data-asin');
            if (!asin) return;

            processedProductsRef.current.delete(asin);
            callbacks.onProductRemoved(asin, element);
        },
        [callbacks]
    );

    const handlePageChange = useCallback(async () => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrlRef.current) {
            currentUrlRef.current = newUrl;
            processedProductsRef.current.clear();

            // Clear active queue
            await apiService.updateQueue('clear');

            callbacks.onPageChanged();
        }
    }, [callbacks]);

    const processInitialProducts = useCallback(() => {
        const products = findProductElements();
        console.log(`[RANKWRANGLER] Found ${products.length} products:`, products.map(el => ({
            asin: el.getAttribute('data-asin'),
            id: el.id,
            className: el.className,
            tagName: el.tagName
        })));
        products.forEach(handleProductAdded);
    }, [findProductElements, handleProductAdded]);

    const startObserver = useCallback(() => {
        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        const observer = new MutationObserver(mutations => {
            // Check for URL changes first
            handlePageChange();

            // Process mutations
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    // Handle removed products
                    mutation.removedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;
                            if (element.hasAttribute('data-asin')) {
                                handleProductRemoved(element);
                            }
                        }
                    });

                    // Handle added products
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;

                            // Check the element itself
                            if (element.hasAttribute('data-asin')) {
                                handleProductAdded(element);
                            }

                            // Check child elements
                            if (element.querySelectorAll) {
                                const childProducts =
                                    element.querySelectorAll<HTMLElement>('[data-asin]');
                                childProducts.forEach(handleProductAdded);
                            }
                        }
                    });
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        observerRef.current = observer;
    }, [handlePageChange, handleProductAdded, handleProductRemoved]);

    useEffect(() => {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            const handleDOMContentLoaded = () => {
                processInitialProducts();
                startObserver();
            };
            document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);
            return () => {
                document.removeEventListener('DOMContentLoaded', handleDOMContentLoaded);
            };
        } else {
            processInitialProducts();
            startObserver();
        }

        // Cleanup
        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [processInitialProducts, startObserver]);

    // Also watch for popstate events (back/forward navigation)
    useEffect(() => {
        window.addEventListener('popstate', handlePageChange);
        return () => {
            window.removeEventListener('popstate', handlePageChange);
        };
    }, [handlePageChange]);

    return {
        processedCount: processedProductsRef.current.size,
        currentUrl: currentUrlRef.current,
    };
}
