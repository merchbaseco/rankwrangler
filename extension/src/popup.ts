/// <reference types="chrome"/>

interface Stats {
    totalRequests: number;
    liveSuccessCount: number;
    cacheSuccessCount: number;
    failureCount: number;
    captchaCount: number;
}

// Update the statistics display
async function updateStats() {
    chrome.runtime.sendMessage(
        { type: 'getStats' },
        (response: { stats?: Stats; queueCount?: number }) => {
            const stats = response.stats || {
                totalRequests: 0,
                liveSuccessCount: 0,
                cacheSuccessCount: 0,
                failureCount: 0,
                captchaCount: 0,
            };

            // Update queue count
            const queueCount = document.getElementById('queueCount');
            if (queueCount) {
                queueCount.textContent = (response.queueCount || 0).toString();
            }

            // Update stats display
            const totalRequests = document.getElementById('totalRequests');
            const successRate = document.getElementById('successRate');
            const liveSuccessCount = document.getElementById('liveSuccessCount');
            const cacheSuccessCount = document.getElementById('cacheSuccessCount');
            const failureCount = document.getElementById('failureCount');
            const captchaCount = document.getElementById('captchaCount');

            if (totalRequests) totalRequests.textContent = stats.totalRequests.toString();
            if (liveSuccessCount) liveSuccessCount.textContent = stats.liveSuccessCount.toString();
            if (cacheSuccessCount)
                cacheSuccessCount.textContent = stats.cacheSuccessCount.toString();
            if (failureCount) failureCount.textContent = stats.failureCount.toString();
            if (captchaCount) captchaCount.textContent = stats.captchaCount.toString();

            // Calculate and display success rate (including both live and cached successes)
            if (successRate) {
                const totalSuccesses = stats.liveSuccessCount + stats.cacheSuccessCount;
                const rate =
                    stats.totalRequests > 0
                        ? Math.round((totalSuccesses / stats.totalRequests) * 100)
                        : 0;
                successRate.textContent = `${rate}%`;
            }
        }
    );
}

// Update the status display in the popup
function updateStatus() {
    // Query the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const currentTab = tabs[0];
        const url = currentTab.url || '';

        const statusText = document.getElementById('statusText');
        if (!statusText) return;

        // Check if we're on an Amazon search page
        const isAmazonSearch = url.includes('amazon.com/s');

        if (isAmazonSearch) {
            statusText.classList.remove('inactive');
            statusText.classList.add('active');
            statusText.textContent = 'Active';
        } else {
            statusText.classList.remove('active');
            statusText.classList.add('inactive');
            statusText.textContent = 'Inactive';
        }
    });
}

// Listen for queue updates from the background script
chrome.runtime.onMessage.addListener((message: { type: string; count?: number }) => {
    if (message.type === 'queueUpdate' && typeof message.count === 'number') {
        const queueCount = document.getElementById('queueCount');
        if (queueCount) {
            queueCount.textContent = message.count.toString();
        }
    }
});

// Update everything when popup opens
document.addEventListener('DOMContentLoaded', () => {
    updateStatus();
    updateStats();

    // Add reset button handler
    const resetButton = document.getElementById('resetStats');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'resetStats' }, () => {
                updateStats(); // Refresh the stats display
            });
        });
    }

    // Add clear cache button handler
    const clearCacheButton = document.getElementById('clearCache');
    if (clearCacheButton) {
        clearCacheButton.addEventListener('click', async () => {
            // Clear the BSR cache
            await chrome.storage.local.set({ bsrCache: {} });
            // Show feedback
            const originalText = clearCacheButton.textContent;
            clearCacheButton.textContent = 'Cache Cleared!';
            clearCacheButton.style.color = '#007600';
            setTimeout(() => {
                clearCacheButton.textContent = originalText;
                clearCacheButton.style.color = '';
            }, 1500);
        });
    }
});

// Update stats periodically
setInterval(updateStats, 2000);
