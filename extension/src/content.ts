/// <reference types="chrome"/>
import { RateLimiter } from 'limiter';

// Cache types
interface CachedBSR {
    rank: string;
    category: string;
    dateFirstAvailable: string;
    timestamp: number;
}

interface BSRCache {
    [asin: string]: CachedBSR;
}

interface BSRInfo {
    rank: string;
    category: string;
    dateFirstAvailable: string;
}

interface ProductInfoResponse {
    asin: string;
    creationDate: string | null;
    bsr: number | null;
    metadata: {
        lastFetched: string; // ISO timestamp when data was fetched from SP-API
        cached: boolean; // true if served from cache, false if fresh from SP-API
    };
}

// Cache duration (12 hours in milliseconds)
const CACHE_DURATION = 12 * 60 * 60 * 1000;

// Cache helper functions
async function getCachedBSR(asin: string): Promise<CachedBSR | null> {
    const result = await chrome.storage.local.get(['bsrCache']);
    const cache: BSRCache = result.bsrCache || {};
    const cachedData = cache[asin];

    if (!cachedData) return null;

    // Check if cache is still valid
    if (Date.now() - cachedData.timestamp > CACHE_DURATION) {
        // Cache expired, remove it
        delete cache[asin];
        await chrome.storage.local.set({ bsrCache: cache });
        return null;
    }

    return cachedData;
}

async function cacheBSR(asin: string, bsrInfo: BSRInfo): Promise<void> {
    const result = await chrome.storage.local.get(['bsrCache']);
    const cache: BSRCache = result.bsrCache || {};

    cache[asin] = {
        ...bsrInfo,
        timestamp: Date.now(),
    };

    await chrome.storage.local.set({ bsrCache: cache });
}

// Create a rate limiter that allows exactly 2 requests per second
const limiter = new RateLimiter({
    tokensPerInterval: 10,
    interval: 'second',
});

// CSS for the loading spinner and BSR display
const STYLES = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .rw-container {
        background: linear-gradient(to right, rgba(255,255,255,0.98), rgba(255,255,255,0.95));
        backdrop-filter: blur(4px);
        border: 1px solid #eee;
        border-radius: 8px;
        padding: 8px 12px;
        margin: 6px 0;
        display: flex;
        align-items: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        animation: fadeIn 0.3s ease-out;
        max-width: fit-content;
        z-index: 1;
    }
    .rw-container.rw-loading {
        gap: 8px;
    }
    .rw-container:not(.rw-loading) {
        flex-direction: column;
        gap: 6px;
    }
    .rw-spinner {
        width: 12px;
        height: 12px;
        border: 1.5px solid #eee;
        border-top: 1.5px solid #232f3e;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        flex-shrink: 0;
    }
    .rw-text {
        color: #232f3e;
        font-size: 13px;
        font-weight: 500;
    }
    .rw-rank {
        font-size: 16px;
        font-weight: 600;
        color: #232f3e;
        margin-right: 4px;
    }
    .rw-category {
        font-size: 11px;
        color: #666;
        margin-left: 4px;
    }
    .rw-success {
        color: #007600;
        display: flex;
        align-items: baseline;
        gap: 2px;
    }
    .rw-error {
        color: #c40000;
        font-size: 14px;
        font-weight: 500;
    }
    .rw-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-top: 6px;
        margin-top: 4px;
        border-top: 1px solid #eee;
        width: 100%;
    }
    .rw-date {
        font-size: 11px;
        color: #666;
        flex: 1;
    }
    .rw-asin {
        font-size: 11px;
        color: #666;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        transition: all 0.2s ease;
        background: #f5f5f5;
    }
    .rw-asin:hover {
        background: #eee;
        color: #232f3e;
    }
`;

// Add styles to the page
function addStyles() {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);
}

/**
 * Creates a loading indicator element
 * @returns HTMLElement for the loading indicator
 */
function createLoadingIndicator(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'rw-container rw-loading';

    const spinner = document.createElement('div');
    spinner.className = 'rw-spinner';

    const text = document.createElement('span');
    text.className = 'rw-text';
    text.textContent = 'Loading BSR...';

    container.appendChild(spinner);
    container.appendChild(text);

    return container;
}

/**
 * Fetches product info from the merchbase.co API
 * @param asin - The product ASIN
 * @param marketplaceId - The marketplace ID (e.g., ATVPDKIKX0DER for US)
 * @returns Promise resolving to the API response
 */
async function fetchProductInfo(
    asin: string,
    marketplaceId: string = 'ATVPDKIKX0DER'
): Promise<{ success: boolean; data?: ProductInfoResponse; error?: string }> {
    // Wait until we have a token (rate limit not exceeded)
    await limiter.removeTokens(1);

    return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'fetchProductInfo', asin, marketplaceId }, resolve);
    });
}

// Console styling
const consoleStyle = {
    prefix: 'background: #232f3e; color: white; border-radius: 3px 0 0 3px; padding: 2px 0 2px 2px;',
    suffix: 'background: #E4E7EBFF; color: white; border-radius: 0 3px 3px 0; padding: 2px 2px 2px 0;',
    success: 'color: #007600; font-weight: bold;',
    warning: 'color: #ff9900; font-weight: bold;',
    error: 'color: #c40000; font-weight: bold;',
    info: 'color: #0066c0; font-weight: bold;',
};

function logInfo(message: string | (() => string)) {
    console.log(
        `%c[RankWrangler]%c 📊%c ${typeof message === 'function' ? message() : message}`,
        consoleStyle.prefix,
        consoleStyle.suffix,
        consoleStyle.info
    );
}

function logSuccess(message: string | (() => string)) {
    console.log(
        '%c[RankWrangler]%c ✅%c Processed ' +
            (typeof message === 'function' ? message() : message),
        consoleStyle.prefix,
        consoleStyle.suffix,
        consoleStyle.success
    );
}

function logWarning(message: string | (() => string)) {
    console.log(
        `%c[RankWrangler]%c ⚠️%c ${typeof message === 'function' ? message() : message}`,
        consoleStyle.prefix,
        consoleStyle.suffix,
        consoleStyle.warning
    );
}

function logError(message: string | (() => string)) {
    console.error(
        `%c[RankWrangler]%c ❌%c ${typeof message === 'function' ? message() : message}`,
        consoleStyle.prefix,
        consoleStyle.suffix,
        consoleStyle.error
    );
}

// Track active requests to cancel them when products are removed
const activeRequests = new Map<string, AbortController>();

// Get current queue size
function getQueueSize(): number {
    return activeRequests.size;
}

/**
 * Processes a single product element by fetching its detail page,
 * extracting the BSR, and then appending the info to the product element.
 * @param productElem - The product element from the search page.
 */
async function processProduct(productElem: HTMLElement): Promise<void> {
    const asin = productElem.getAttribute('data-asin');
    if (!asin) {
        logWarning('Product element has no ASIN');
        return;
    }

    // Find the title recipe container
    const titleRecipeContainer = productElem.querySelector('div[data-cy="title-recipe"]');
    if (!titleRecipeContainer) {
        return;
    }

    // Find the existing loading indicator
    const loadingIndicator = productElem.querySelector('.rw-container');
    if (!loadingIndicator) {
        return;
    }

    // Create an abort controller for this request
    const abortController = new AbortController();
    activeRequests.set(asin, abortController);
    // Update queue count
    await chrome.runtime.sendMessage({
        type: 'updateQueue',
        action: 'add',
        asin,
    });
    logInfo(`Added ASIN ${asin} to queue (${getQueueSize()} in queue)`);

    try {
        // Check cache first
        const cachedData = await getCachedBSR(asin);
        if (cachedData) {
            // Use cached data
            const resultContainer = document.createElement('div');
            resultContainer.className = 'rw-container';
            resultContainer.innerHTML = `
                <span class="rw-success">
                    <span class="rw-rank">#${cachedData.rank}</span>
                    <span class="rw-category">in ${cachedData.category}</span>
                </span>
                <div class="rw-meta">
                    <span class="rw-date">${cachedData.dateFirstAvailable}</span>
                    <span class="rw-asin" title="Click to copy ASIN">${asin}</span>
                </div>
            `;

            // Add click handler for ASIN
            const asinElement = resultContainer.querySelector('.rw-asin');
            if (asinElement) {
                asinElement.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(asin);
                        asinElement.textContent = 'Copied!';
                        setTimeout(() => {
                            asinElement.textContent = asin;
                        }, 1000);
                    } catch (error) {
                        console.error('Failed to copy ASIN:', error);
                    }
                });
            }

            loadingIndicator.replaceWith(resultContainer);
            // Update queue count in background script first
            await chrome.runtime.sendMessage({
                type: 'updateQueue',
                action: 'remove',
                asin,
            });
            // Then update local state
            activeRequests.delete(asin);
            logSuccess(
                `ASIN ${asin}: #${cachedData.rank} in ${cachedData.category} (cached) (${getQueueSize()} in queue)`
            );
            return;
        }

        // Fetch product info from the API
        const response = await fetchProductInfo(asin);

        // Check if request was aborted
        if (abortController.signal.aborted) {
            return;
        }

        if (!response.success || !response.data) {
            const errorContainer = document.createElement('div');
            errorContainer.className = 'rw-container';
            errorContainer.innerHTML = `<span class="rw-error">${response.error || 'Failed to fetch'}</span>`;
            loadingIndicator.replaceWith(errorContainer);
            activeRequests.delete(asin);
            logError(
                `ASIN ${asin}: ${response.error || 'API request failed'} (${getQueueSize()} in queue)`
            );
            return;
        }

        const productInfo = response.data;

        // Create result container
        const resultContainer = document.createElement('div');
        resultContainer.className = 'rw-container';

        if (productInfo.bsr && productInfo.creationDate) {
            // Format the creation date
            const formattedDate = new Date(productInfo.creationDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });

            const bsrInfo: BSRInfo = {
                rank: productInfo.bsr.toLocaleString(),
                category: 'Clothing', // API returns BSR for clothing category
                dateFirstAvailable: formattedDate,
            };

            // Success case - product info retrieved

            // Cache the successful result
            await cacheBSR(asin, bsrInfo);

            resultContainer.innerHTML = `
                <span class="rw-success">
                    <span class="rw-rank">#${bsrInfo.rank}</span>
                    <span class="rw-category">in ${bsrInfo.category}</span>
                </span>
                <div class="rw-meta">
                    <span class="rw-date">${bsrInfo.dateFirstAvailable}</span>
                    <span class="rw-asin" title="Click to copy ASIN">${asin}</span>
                </div>
            `;

            // Add click handler for ASIN
            const asinElement = resultContainer.querySelector('.rw-asin');
            if (asinElement) {
                asinElement.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(asin);
                        asinElement.textContent = 'Copied!';
                        setTimeout(() => {
                            asinElement.textContent = asin;
                        }, 1000);
                    } catch (error) {
                        console.error('Failed to copy ASIN:', error);
                    }
                });
            }

            loadingIndicator.replaceWith(resultContainer);
            activeRequests.delete(asin);
            logSuccess(
                `ASIN ${asin}: #${bsrInfo.rank} in ${bsrInfo.category} (API, fetched: ${new Date(response.data.metadata.lastFetched).toLocaleString()}) (${getQueueSize()} in queue)`
            );
            return;
        }

        // Handle cases where BSR or date is null
        resultContainer.innerHTML = `<span class="rw-text">No rank data</span>`;
        loadingIndicator.replaceWith(resultContainer);
        activeRequests.delete(asin);
        logWarning(`ASIN ${asin}: BSR not found (API) (${getQueueSize()} in queue)`);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            // Request was aborted, just clean up
            loadingIndicator.remove();
            logInfo(`ASIN ${asin}: Request aborted (${getQueueSize()} in queue)`);
        } else {
            const errorContainer = document.createElement('div');
            errorContainer.className = 'rw-container';
            errorContainer.innerHTML = `<span class="rw-error">Unable to fetch rank</span>`;
            loadingIndicator.replaceWith(errorContainer);
            logError(
                `Error processing ASIN ${asin}: ${
                    error instanceof Error ? error.message : 'Unknown error'
                } (${getQueueSize()} in queue)`
            );
        }
    } finally {
        activeRequests.delete(asin);
        // Update queue count
        chrome.runtime.sendMessage({ type: 'updateQueue', action: 'remove', asin });
    }
}

// Set up a MutationObserver to watch for new products
function setupSearchResultsObserver() {
    const bodyElement = document.body;
    if (!bodyElement) {
        logWarning('Body element not found. Waiting for page load...');
        return;
    }

    // Add styles once at the start
    addStyles();
    logInfo('Queue processor active. Watching for products...');

    let currentUrl = window.location.href;

    const observer = new MutationObserver(mutations => {
        // Check if URL has changed
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;

            // Cancel all pending requests
            activeRequests.forEach(controller => {
                controller.abort();
            });
            activeRequests.clear();

            // Clear the queue in the background script
            chrome.runtime.sendMessage({ type: 'updateQueue', action: 'clear' });

            // Remove all existing BSR displays
            document.querySelectorAll('.rw-container').forEach(container => {
                container.remove();
            });

            return;
        }

        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // Handle removed products first
                mutation.removedNodes.forEach(node => {
                    if (node instanceof Element) {
                        // Check if this node is a product or contains products
                        const products = [
                            ...(node.matches('div[data-asin]') ? [node] : []),
                            ...node.querySelectorAll('div[data-asin]'),
                        ];

                        // Cancel any pending requests and clean up
                        products.forEach(product => {
                            if (product instanceof Element) {
                                const asin = product.getAttribute('data-asin');
                                if (asin) {
                                    const controller = activeRequests.get(asin);
                                    if (controller) {
                                        controller.abort();
                                        activeRequests.delete(asin);
                                        // Update queue count
                                        chrome.runtime.sendMessage({
                                            type: 'updateQueue',
                                            action: 'remove',
                                            asin,
                                        });
                                    }
                                }
                            }
                        });
                    }
                });

                // Process new products
                mutation.addedNodes.forEach(node => {
                    if (node instanceof Element) {
                        // Check if this node is a product or contains products
                        const products = [
                            ...(node.matches('div[data-asin]') ? [node] : []),
                            ...node.querySelectorAll('div[data-asin]'),
                        ];

                        // Process each product
                        products.forEach(product => {
                            if (product instanceof Element) {
                                const asin = product.getAttribute('data-asin');
                                if (asin && asin !== '' && asin !== 'undefined') {
                                    // Find the title recipe container
                                    const titleRecipeContainer = product.querySelector(
                                        'div[data-cy="title-recipe"]'
                                    );
                                    if (titleRecipeContainer?.parentElement) {
                                        const loadingIndicator = createLoadingIndicator();
                                        titleRecipeContainer.parentElement.insertBefore(
                                            loadingIndicator,
                                            titleRecipeContainer.parentElement.firstChild
                                        );

                                        // Process this product
                                        processProduct(product as HTMLElement).catch(error => {
                                            logError(
                                                `Error processing ASIN ${asin}: ${
                                                    error instanceof Error
                                                        ? error.message
                                                        : 'Unknown error'
                                                }`
                                            );
                                        });
                                    }
                                }
                            }
                        });
                    }
                });
            }
        }
    });

    // Start observing with all the necessary options
    observer.observe(bodyElement, {
        childList: true,
        subtree: true,
    });

    // Process any existing products on the page
    const existingProducts = document.querySelectorAll<HTMLElement>(
        'div[data-asin]:not([data-asin=""]):not([data-asin="undefined"])'
    );

    if (existingProducts.length > 0) {
        logInfo(`Processing ${existingProducts.length} existing products...`);
    }

    existingProducts.forEach(product => {
        const asin = product.getAttribute('data-asin');
        if (asin) {
            const titleRecipeContainer = product.querySelector('div[data-cy="title-recipe"]');
            if (titleRecipeContainer?.parentElement) {
                const loadingIndicator = createLoadingIndicator();
                titleRecipeContainer.parentElement.insertBefore(
                    loadingIndicator,
                    titleRecipeContainer.parentElement.firstChild
                );
                processProduct(product).catch(error => {
                    logError(
                        `Error processing ASIN ${asin}: ${
                            error instanceof Error ? error.message : 'Unknown error'
                        }`
                    );
                });
            }
        }
    });
}

// Start observing when the script loads
setupSearchResultsObserver();

// Export functions for testing or external use
export { processProduct };
