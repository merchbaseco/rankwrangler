// Settings page functionality
document.addEventListener('DOMContentLoaded', async () => {
    const licenseKeyInput = document.getElementById('licenseKey');
    const saveButton = document.getElementById('saveButton');
    const validateButton = document.getElementById('validateButton');
    const statusDiv = document.getElementById('status');
    const licenseInfoDiv = document.getElementById('licenseInfo');

    // Load saved license key
    const stored = await chrome.storage.sync.get(['licenseKey']);
    if (stored.licenseKey) {
        licenseKeyInput.value = stored.licenseKey;
        await validateLicense(stored.licenseKey, false);
    }

    // Save license key
    saveButton.addEventListener('click', async () => {
        const licenseKey = licenseKeyInput.value.trim();

        if (!licenseKey) {
            showStatus('Please enter a license key', 'error');
            return;
        }

        try {
            saveButton.disabled = true;
            saveButton.textContent = 'Saving...';

            // Validate license before saving
            const isValid = await validateLicense(licenseKey, true);

            if (isValid) {
                await chrome.storage.sync.set({ licenseKey });
                showStatus('License key saved successfully!', 'success');
            }
        } catch (error) {
            console.error('Error saving license:', error);
            showStatus('Failed to save license key', 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save License';
        }
    });

    // Validate license key
    validateButton.addEventListener('click', async () => {
        const licenseKey = licenseKeyInput.value.trim();

        if (!licenseKey) {
            showStatus('Please enter a license key', 'error');
            return;
        }

        await validateLicense(licenseKey, true);
    });

    async function validateLicense(licenseKey, showLoading = true) {
        try {
            if (showLoading) {
                validateButton.disabled = true;
                validateButton.textContent = 'Validating...';
                showStatus('Validating license...', 'warning');
            }

            const response = await fetch('https://merchbase.co/api/license/validate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ licenseKey }),
            });

            const result = await response.json();

            if (result.success && result.data) {
                const license = result.data;

                // Show license information
                document.getElementById('licenseEmail').textContent = license.email;
                document.getElementById('licenseUsage').textContent =
                    `${license.usageToday}/${license.dailyLimit}`;
                document.getElementById('licenseExpires').textContent = new Date(
                    license.expiresAt
                ).toLocaleDateString();

                licenseInfoDiv.style.display = 'block';

                if (showLoading) {
                    showStatus('License is valid and active!', 'success');
                }

                return true;
            } else {
                licenseInfoDiv.style.display = 'none';

                if (showLoading) {
                    showStatus(result.error || 'Invalid license key', 'error');
                }

                return false;
            }
        } catch (error) {
            console.error('Error validating license:', error);
            licenseInfoDiv.style.display = 'none';

            if (showLoading) {
                showStatus('Failed to validate license key', 'error');
            }

            return false;
        } finally {
            if (showLoading) {
                validateButton.disabled = false;
                validateButton.textContent = 'Validate';
            }
        }
    }

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.classList.remove('hidden');

        // Auto-hide success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.classList.add('hidden');
            }, 3000);
        }
    }
});
