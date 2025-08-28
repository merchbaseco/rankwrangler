import type { 
  ValidateLicenseMessage,
  SetLicenseMessage,
  RemoveLicenseMessage,
  GetLicenseStatusMessage,
  LicenseResponse,
  ValidationResponse,
  LicenseStatus
} from '../../content/types';

export class LicenseHandler {
  private static instance: LicenseHandler;
  private readonly API_BASE_URL = 'https://merchbase.co/api';

  static getInstance(): LicenseHandler {
    if (!LicenseHandler.instance) {
      LicenseHandler.instance = new LicenseHandler();
    }
    return LicenseHandler.instance;
  }

  async handleValidateLicense(
    message: ValidateLicenseMessage,
    sendResponse: (response: ValidationResponse) => void
  ): Promise<void> {
    try {
      let licenseKey = message.licenseKey;
      
      // If no license key provided, get from storage
      if (!licenseKey) {
        const result = await chrome.storage.sync.get(['licenseKey']);
        licenseKey = result.licenseKey;
      }

      if (!licenseKey) {
        sendResponse({
          success: true,
          valid: false,
          error: 'No license key provided'
        });
        return;
      }

      // Validate against API using dedicated validation endpoint
      const response = await fetch(`${this.API_BASE_URL}/license/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          licenseKey 
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Store validation result with timestamp and license data
        await chrome.storage.local.set({
          licenseValidation: {
            isValid: true,
            lastValidated: Date.now(),
            licenseKey,
            licenseData: data.data // Store license info from server
          }
        });

        sendResponse({
          success: true,
          valid: true,
          data: data.data
        });
      } else {
        // Handle different error codes
        let error = 'Invalid license key';
        if (response.status === 429) {
          error = 'Daily usage limit exceeded';
        } else if (response.status === 401) {
          error = 'Invalid or expired license key';
        }

        sendResponse({
          success: true,
          valid: false,
          error
        });
      }

    } catch (error) {
      console.error('License validation error:', error);
      sendResponse({
        success: false,
        valid: false,
        error: error instanceof Error ? error.message : 'Network error during validation'
      });
    }
  }

  async handleSetLicense(
    message: SetLicenseMessage,
    sendResponse: (response: LicenseResponse) => void
  ): Promise<void> {
    try {
      const { licenseKey } = message;
      
      if (!licenseKey || licenseKey.trim().length === 0) {
        sendResponse({
          success: false,
          error: 'License key cannot be empty'
        });
        return;
      }

      // Save to sync storage
      await chrome.storage.sync.set({ licenseKey: licenseKey.trim() });
      
      // Clear any previous validation cache
      await chrome.storage.local.remove(['licenseValidation']);

      // Validate the new license
      await this.validateLicenseKey(licenseKey.trim());

      const status = await this.getCurrentLicenseStatus();
      
      sendResponse({
        success: true,
        status
      });

    } catch (error) {
      console.error('Set license error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save license key'
      });
    }
  }

  async handleRemoveLicense(
    message: RemoveLicenseMessage,
    sendResponse: (response: LicenseResponse) => void
  ): Promise<void> {
    try {
      // Remove from both sync and local storage
      await chrome.storage.sync.remove(['licenseKey']);
      await chrome.storage.local.remove(['licenseValidation']);

      const status = await this.getCurrentLicenseStatus();

      sendResponse({
        success: true,
        status
      });

    } catch (error) {
      console.error('Remove license error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove license key'
      });
    }
  }

  async handleGetLicenseStatus(
    message: GetLicenseStatusMessage,
    sendResponse: (response: LicenseResponse) => void
  ): Promise<void> {
    try {
      const status = await this.getCurrentLicenseStatus();
      
      sendResponse({
        success: true,
        status
      });

    } catch (error) {
      console.error('Get license status error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get license status'
      });
    }
  }

  private async getCurrentLicenseStatus(): Promise<LicenseStatus> {
    const syncResult = await chrome.storage.sync.get(['licenseKey']);
    const localResult = await chrome.storage.local.get(['licenseValidation']);

    const licenseKey = syncResult.licenseKey || null;
    const validation = localResult.licenseValidation;

    if (!licenseKey) {
      return {
        isValid: false,
        licenseKey: null
      };
    }

    // Check if we have recent validation data (within 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const isRecentValidation = validation && 
      validation.lastValidated && 
      validation.lastValidated > oneHourAgo;

    if (isRecentValidation && validation.licenseKey === licenseKey) {
      return {
        isValid: validation.isValid,
        licenseKey,
        lastValidated: validation.lastValidated,
        error: validation.error,
        licenseData: validation.licenseData // Include license data from server
      };
    }

    // If no recent validation, we need to check
    return {
      isValid: false, // Unknown until validated
      licenseKey,
      error: 'License needs validation'
    };
  }

  // Get fresh license status from server
  private async fetchFreshLicenseStatus(licenseKey: string): Promise<any> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/license/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${licenseKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch license status:', error);
      return null;
    }
  }

  private async validateLicenseKey(licenseKey: string): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/license/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          licenseKey 
        })
      });

      const isValid = response.ok;
      let licenseData = null;
      
      if (isValid) {
        const data = await response.json();
        licenseData = data.data;
      }
      
      await chrome.storage.local.set({
        licenseValidation: {
          isValid,
          lastValidated: Date.now(),
          licenseKey,
          licenseData
        }
      });

    } catch (error) {
      console.error('License validation failed:', error);
      // Store failed validation
      await chrome.storage.local.set({
        licenseValidation: {
          isValid: false,
          lastValidated: Date.now(),
          licenseKey,
          error: 'Validation failed'
        }
      });
    }
  }
}