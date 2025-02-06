/// <reference types="chrome"/>

interface FetchProductPageRequest {
    type: 'fetchProductPage';
    url?: string;
    headers?: Record<string, string>;
    success?: boolean;
    fromCache?: boolean;
}

interface GetRequestHeadersRequest {
    type: 'getRequestHeaders';
}

interface GetStatsRequest {
    type: 'getStats';
}

interface ResetStatsRequest {
    type: 'resetStats';
}

interface UpdateQueueRequest {
    type: 'updateQueue';
    action: 'add' | 'remove' | 'clear';
    asin?: string;
}

type Message =
    | FetchProductPageRequest
    | GetRequestHeadersRequest
    | GetStatsRequest
    | ResetStatsRequest
    | UpdateQueueRequest;

interface Stats {
    totalRequests: number;
    liveSuccessCount: number;
    cacheSuccessCount: number;
    failureCount: number;
    captchaCount: number;
}

// Track active requests
const activeQueue = new Set<string>();

// Initialize statistics in storage
chrome.storage.local.get(['stats'], result => {
    if (!result.stats) {
        chrome.storage.local.set({
            stats: {
                totalRequests: 0,
                liveSuccessCount: 0,
                cacheSuccessCount: 0,
                failureCount: 0,
                captchaCount: 0,
            },
        });
    }
});

// Store the most recent request headers
let lastRequestHeaders: Record<string, string> = {};

// Function to check if HTML contains a captcha
function containsCaptcha(html: string): boolean {
    return (
        html.includes('Enter the characters you see below') ||
        html.includes('Type the characters you see in this image') ||
        html.includes('Continue shopping')
    );
}

// Function to broadcast queue count to all popups
function broadcastQueueCount() {
    chrome.runtime.sendMessage({ type: 'queueUpdate', count: activeQueue.size });
}

// Capture headers from web requests
chrome.webRequest.onSendHeaders.addListener(
    details => {
        if (details.type === 'main_frame' && details.url.includes('amazon.com')) {
            lastRequestHeaders = {};
            details.requestHeaders?.forEach(header => {
                lastRequestHeaders[header.name] = header.value || '';
            });
        }
    },
    { urls: ['*://*.amazon.com/*'] },
    ['requestHeaders']
);

// Listen for messages from the content script
chrome.runtime.onMessage.addListener(
    (
        request: Message,
        sender: chrome.runtime.MessageSender,
        sendResponse: (
            response:
                | {
                      html?: string;
                      error?: string;
                      stats?: Stats;
                      captcha?: boolean;
                      queueCount?: number;
                  }
                | Record<string, string>
        ) => void
    ) => {
        if (request.type === 'getRequestHeaders') {
            sendResponse(lastRequestHeaders);
            return true;
        }

        if (request.type === 'resetStats') {
            chrome.storage.local.set(
                {
                    stats: {
                        totalRequests: 0,
                        liveSuccessCount: 0,
                        cacheSuccessCount: 0,
                        failureCount: 0,
                        captchaCount: 0,
                    },
                },
                () => {
                    sendResponse({});
                }
            );
            return true;
        }

        if (request.type === 'updateQueue') {
            if (request.action === 'add' && request.asin) {
                activeQueue.add(request.asin);
            } else if (request.action === 'remove' && request.asin) {
                activeQueue.delete(request.asin);
            } else if (request.action === 'clear') {
                activeQueue.clear();
            }
            broadcastQueueCount();
            sendResponse({ queueCount: activeQueue.size });
            return true;
        }

        if (request.type === 'fetchProductPage') {
            if ('url' in request && request.url) {
                fetch(request.url, {
                    headers: request.headers || {},
                    credentials: 'include',
                })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.text();
                    })
                    .then(async html => {
                        if (!html) {
                            throw new Error('Empty response received');
                        }

                        // Check for captcha
                        if (containsCaptcha(html)) {
                            chrome.storage.local.get(['stats'], result => {
                                const stats = result.stats || {
                                    totalRequests: 0,
                                    liveSuccessCount: 0,
                                    cacheSuccessCount: 0,
                                    failureCount: 0,
                                    captchaCount: 0,
                                };
                                stats.captchaCount++;
                                chrome.storage.local.set({ stats });
                            });
                            sendResponse({ error: 'Captcha detected', captcha: true });
                            return;
                        }

                        sendResponse({ html });
                    })
                    .catch(error => {
                        sendResponse({ error: error.message });
                    });

                return true;
            } else {
                // This is a stats update from the content script
                chrome.storage.local.get(['stats'], async result => {
                    const stats: Stats = result.stats || {
                        totalRequests: 0,
                        liveSuccessCount: 0,
                        cacheSuccessCount: 0,
                        failureCount: 0,
                        captchaCount: 0,
                    };

                    stats.totalRequests++;
                    if (request.success) {
                        if (request.fromCache) {
                            stats.cacheSuccessCount++;
                        } else {
                            stats.liveSuccessCount++;
                        }
                    } else {
                        stats.failureCount++;
                    }

                    await chrome.storage.local.set({ stats });
                    sendResponse({});
                });
                return true;
            }
        }

        if (request.type === 'getStats') {
            chrome.storage.local.get(['stats'], result => {
                sendResponse({ stats: result.stats, queueCount: activeQueue.size });
            });
            return true;
        }
    }
);
