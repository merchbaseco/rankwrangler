import type { 
  FetchProductInfoMessage, 
  ProductInfoResponse, 
  Stats 
} from '../../content/types';

export class ProductInfoHandler {
  private static instance: ProductInfoHandler;
  private readonly API_BASE_URL = 'https://merchbase.co/api';

  static getInstance(): ProductInfoHandler {
    if (!ProductInfoHandler.instance) {
      ProductInfoHandler.instance = new ProductInfoHandler();
    }
    return ProductInfoHandler.instance;
  }

  async handleFetchProductInfo(
    message: FetchProductInfoMessage,
    sendResponse: (response: ProductInfoResponse) => void
  ): Promise<void> {
    try {
      // Update stats - increment total requests
      await this.incrementTotalRequests();

      // Get license key from storage
      const result = await chrome.storage.sync.get(['licenseKey']);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add authorization header if license key exists
      if (result.licenseKey) {
        headers.Authorization = `Bearer ${result.licenseKey}`;
      }

      const response = await fetch(`${this.API_BASE_URL}/getProductInfo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          asin: message.asin,
          marketplaceId: message.marketplaceId,
        }),
      });

      if (!response.ok) {
        let errorMessage: string;
        
        switch (response.status) {
          case 401:
            errorMessage = 'Invalid or missing license key. Please check your license settings.';
            break;
          case 429:
            errorMessage = 'Daily usage limit exceeded. License will reset at midnight UTC.';
            break;
          default:
            errorMessage = `Server error (${response.status}). Please try again later.`;
        }

        await this.incrementFailureCount();
        sendResponse({
          success: false,
          error: errorMessage,
        });
        return;
      }

      const data = await response.json();
      
      // Determine if this was a cache hit based on the response metadata
      if (data.metadata?.cached) {
        await this.incrementCacheSuccessCount();
      } else {
        await this.incrementLiveSuccessCount();
      }

      sendResponse({
        success: true,
        data,
      });

    } catch (error) {
      console.error('ProductInfoHandler error:', error);
      await this.incrementFailureCount();
      
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Network error. Please check your connection.',
      });
    }
  }

  private async getStats(): Promise<Stats> {
    const result = await chrome.storage.local.get(['stats']);
    return result.stats || {
      totalRequests: 0,
      liveSuccessCount: 0,
      cacheSuccessCount: 0,
      failureCount: 0,
    };
  }

  private async updateStats(updates: Partial<Stats>): Promise<void> {
    const currentStats = await this.getStats();
    const newStats = { ...currentStats, ...updates };
    await chrome.storage.local.set({ stats: newStats });
  }

  private async incrementTotalRequests(): Promise<void> {
    const stats = await this.getStats();
    await this.updateStats({ totalRequests: stats.totalRequests + 1 });
  }

  private async incrementLiveSuccessCount(): Promise<void> {
    const stats = await this.getStats();
    await this.updateStats({ liveSuccessCount: stats.liveSuccessCount + 1 });
  }

  private async incrementCacheSuccessCount(): Promise<void> {
    const stats = await this.getStats();
    await this.updateStats({ cacheSuccessCount: stats.cacheSuccessCount + 1 });
  }

  private async incrementFailureCount(): Promise<void> {
    const stats = await this.getStats();
    await this.updateStats({ failureCount: stats.failureCount + 1 });
  }
}