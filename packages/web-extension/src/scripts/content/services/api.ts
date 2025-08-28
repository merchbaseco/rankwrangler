import type { 
  ProductInfo,
  ProductInfoResponse,
  Stats,
  StatsResponse,
  FetchProductInfoMessage,
  GetStatsMessage,
  ResetStatsMessage,
  UpdateQueueMessage
} from '../types';
import { apiRateLimiter } from './rateLimiter';

export class ApiService {
  private static instance: ApiService;
  private readonly defaultMarketplaceId = 'ATVPDKIKX0DER';

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
    await apiRateLimiter.removeTokens(1);
    console.log(`[apiService] Rate limiting passed for ASIN: ${asin}`);

    return new Promise((resolve) => {
      const message: FetchProductInfoMessage = {
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
   * Gets extension statistics
   * @returns Promise resolving to stats response
   */
  async getStats(): Promise<StatsResponse> {
    return new Promise((resolve) => {
      const message: GetStatsMessage = {
        type: 'getStats',
      };

      chrome.runtime.sendMessage(message, (response: StatsResponse) => {
        if (chrome.runtime.lastError) {
          console.error('getStats error:', chrome.runtime.lastError);
          resolve({});
          return;
        }

        resolve(response || {});
      });
    });
  }

  /**
   * Resets extension statistics
   * @returns Promise resolving to stats response
   */
  async resetStats(): Promise<StatsResponse> {
    return new Promise((resolve) => {
      const message: ResetStatsMessage = {
        type: 'resetStats',
      };

      chrome.runtime.sendMessage(message, (response: StatsResponse) => {
        if (chrome.runtime.lastError) {
          console.error('resetStats error:', chrome.runtime.lastError);
          resolve({});
          return;
        }

        resolve(response || {});
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
      const message: UpdateQueueMessage = {
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

  /**
   * Gets rate limiter status
   * @returns Rate limiter information
   */
  getRateLimiterStatus() {
    return {
      availableTokens: apiRateLimiter.getAvailableTokens(),
      waitTime: apiRateLimiter.getWaitTime(1),
      hasTokens: apiRateLimiter.hasTokens(1),
    };
  }
}

// Export singleton instance for convenience
export const apiService = ApiService.getInstance();