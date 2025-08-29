import type { 
  ProductInfoResponse,
  StatsResponse
} from '../types';
import { RateLimiter } from 'limiter';

export class ApiService {
  private static instance: ApiService;
  private readonly defaultMarketplaceId = 'ATVPDKIKX0DER';
  private readonly rateLimiter = new RateLimiter({
    tokensPerInterval: 10,
    interval: 'second'
  });

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * Fetches product information from the API via service worker
   * @param asin - Product ASIN
   * @param marketplaceId - Marketplace ID (defaults to US)
   * @returns Promise resolving to product info response
   */
  async fetchProductInfo(
    asin: string,
    marketplaceId: string = this.defaultMarketplaceId
  ): Promise<ProductInfoResponse> {
    console.log(`[apiService] Starting fetchProductInfo for ASIN: ${asin}`);
    
    // Apply rate limiting
    await this.rateLimiter.removeTokens(1);
    console.log(`[apiService] Rate limiting passed for ASIN: ${asin}`);

    return new Promise((resolve) => {
      const message = {
        type: 'fetchProductInfo',
        asin,
        marketplaceId,
      };

      console.log(`[apiService] Sending message to service worker:`, message);

      chrome.runtime.sendMessage(message, (response: ProductInfoResponse) => {
        console.log(`[apiService] Received response for ASIN ${asin}:`, response);
        
        if (chrome.runtime.lastError) {
          console.error(`[apiService] Chrome runtime error for ASIN ${asin}:`, chrome.runtime.lastError);
          resolve({
            success: false,
            error: `Communication error: ${chrome.runtime.lastError.message}`,
          });
          return;
        }

        if (!response) {
          console.error(`[apiService] No response from service worker for ASIN ${asin}`);
          resolve({
            success: false,
            error: 'No response from background script',
          });
          return;
        }

        console.log(`[apiService] Successfully resolved response for ASIN ${asin}`);
        resolve(response);
      });
    });
  }

  /**
   * Updates the queue (add/remove/clear ASINs)
   * @param action - Queue action to perform
   * @param asin - ASIN for add/remove actions
   * @returns Promise resolving to queue count
   */
  async updateQueue(
    action: 'add' | 'remove' | 'clear',
    asin?: string
  ): Promise<number> {
    return new Promise((resolve) => {
      const message = {
        type: 'updateQueue',
        action,
        asin,
      };

      chrome.runtime.sendMessage(message, (response: StatsResponse) => {
        if (chrome.runtime.lastError) {
          console.error('updateQueue error:', chrome.runtime.lastError);
          resolve(0);
          return;
        }

        resolve(response?.queueCount || 0);
      });
    });
  }

  /**
   * Checks if the service worker is alive
   * @returns Promise resolving to true if alive, false otherwise
   */
  async ping(): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(response?.alive === true);
      });
    });
  }

}

// Export singleton instance for convenience
export const apiService = ApiService.getInstance();