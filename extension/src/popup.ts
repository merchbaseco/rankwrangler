/// <reference types="chrome"/>

interface Stats {
    totalRequests: number;
    liveSuccessCount: number;
    cacheSuccessCount: number;
    failureCount: number;
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

            if (totalRequests) totalRequests.textContent = stats.totalRequests.toString();
            if (liveSuccessCount) liveSuccessCount.textContent = stats.liveSuccessCount.toString();
            if (cacheSuccessCount)
                cacheSuccessCount.textContent = stats.cacheSuccessCount.toString();
            if (failureCount) failureCount.textContent = stats.failureCount.toString();

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

// Check license status
async function updateLicenseStatus() {
    const licenseStatus = document.getElementById('licenseStatus');
    if (!licenseStatus) return;

    try {
        const stored = await chrome.storage.sync.get(['licenseKey']);
        
        if (!stored.licenseKey) {
            licenseStatus.textContent = 'No license key configured';
            licenseStatus.className = 'license-status invalid';
            return;
        }

        // Validate license with server
        const response = await fetch('https://merchbase.co/api/license/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ licenseKey: stored.licenseKey })
        });

        const result = await response.json();

        if (result.success && result.data) {
            const license = result.data;
            licenseStatus.textContent = `${license.email} - ${license.usageToday}/${license.dailyLimit} today`;
            licenseStatus.className = 'license-status valid';
        } else {
            licenseStatus.textContent = result.error || 'Invalid license key';
            licenseStatus.className = 'license-status invalid';
        }
    } catch (error) {
        licenseStatus.textContent = 'Unable to check license status';
        licenseStatus.className = 'license-status invalid';
    }
}

// Update everything when popup opens
document.addEventListener('DOMContentLoaded', async () => {
    updateStatus();
    updateStats();
    updateLicenseStatus();

    // Add settings button handler (toggle settings section)
    const settingsButton = document.getElementById('openSettings');
    const settingsSection = document.getElementById('settingsSection');
    if (settingsButton && settingsSection) {
        settingsButton.addEventListener('click', () => {
            settingsSection.classList.toggle('expanded');
            settingsButton.textContent = settingsSection.classList.contains('expanded') 
                ? 'Hide License Settings' 
                : 'License Settings';
        });
    }

    // Load license settings when popup opens
    await loadLicenseSettings();

    // Add license button handlers
    const saveLicenseButton = document.getElementById('saveLicense');
    const validateLicenseButton = document.getElementById('validateLicense');
    const licenseKeyInput = document.getElementById('licenseKey') as HTMLInputElement;

    if (saveLicenseButton) {
        saveLicenseButton.addEventListener('click', async () => {
            const licenseKey = licenseKeyInput?.value?.trim();
            if (!licenseKey) {
                showStatusMessage('Please enter a license key', 'error');
                return;
            }

            try {
                saveLicenseButton.textContent = 'Saving...';
                (saveLicenseButton as HTMLButtonElement).disabled = true;

                const isValid = await validateLicenseKey(licenseKey, true);
                if (isValid) {
                    await chrome.storage.sync.set({ licenseKey });
                    showStatusMessage('License key saved successfully!', 'success');
                    updateLicenseStatus(); // Refresh the main license status
                }
            } catch (error) {
                console.error('Error saving license:', error);
                showStatusMessage('Failed to save license key', 'error');
            } finally {
                saveLicenseButton.textContent = 'Save License';
                (saveLicenseButton as HTMLButtonElement).disabled = false;
            }
        });
    }

    if (validateLicenseButton) {
        validateLicenseButton.addEventListener('click', async () => {
            const licenseKey = licenseKeyInput?.value?.trim();
            if (!licenseKey) {
                showStatusMessage('Please enter a license key', 'error');
                return;
            }
            await validateLicenseKey(licenseKey, true);
        });
    }

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

// License settings functions
async function loadLicenseSettings() {
    const licenseKeyInput = document.getElementById('licenseKey') as HTMLInputElement;
    if (!licenseKeyInput) return;

    try {
        const stored = await chrome.storage.sync.get(['licenseKey']);
        if (stored.licenseKey) {
            licenseKeyInput.value = stored.licenseKey;
            await validateLicenseKey(stored.licenseKey, false);
        }
    } catch (error) {
        console.error('Error loading license settings:', error);
    }
}

async function validateLicenseKey(licenseKey: string, showLoading: boolean = true): Promise<boolean> {
    const validateButton = document.getElementById('validateLicense') as HTMLButtonElement;
    const licenseInfoDiv = document.getElementById('licenseInfo');

    try {
        if (showLoading && validateButton) {
            validateButton.disabled = true;
            validateButton.textContent = 'Validating...';
            showStatusMessage('Validating license...', 'warning');
        }

        const response = await fetch('https://merchbase.co/api/license/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ licenseKey })
        });

        const result = await response.json();

        if (result.success && result.data) {
            const license = result.data;
            
            // Show license information
            const emailEl = document.getElementById('licenseEmail');
            const usageEl = document.getElementById('licenseUsage');
            const expiresEl = document.getElementById('licenseExpires');
            
            if (emailEl) emailEl.textContent = license.email;
            if (usageEl) usageEl.textContent = `${license.usageToday}/${license.dailyLimit}`;
            if (expiresEl) expiresEl.textContent = new Date(license.expiresAt).toLocaleDateString();
            
            if (licenseInfoDiv) licenseInfoDiv.style.display = 'block';
            
            if (showLoading) {
                showStatusMessage('License is valid and active!', 'success');
            }
            
            return true;
        } else {
            if (licenseInfoDiv) licenseInfoDiv.style.display = 'none';
            
            if (showLoading) {
                showStatusMessage(result.error || 'Invalid license key', 'error');
            }
            
            return false;
        }
    } catch (error) {
        console.error('Error validating license:', error);
        if (licenseInfoDiv) licenseInfoDiv.style.display = 'none';
        
        if (showLoading) {
            showStatusMessage('Failed to validate license key', 'error');
        }
        
        return false;
    } finally {
        if (showLoading && validateButton) {
            validateButton.disabled = false;
            validateButton.textContent = 'Validate';
        }
    }
}

function showStatusMessage(message: string, type: 'success' | 'error' | 'warning') {
    const statusDiv = document.getElementById('statusMessage');
    if (!statusDiv) return;

    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';

    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
}
