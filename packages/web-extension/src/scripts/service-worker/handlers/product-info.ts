import type { FetchProductInfoMessage, ProductInfoResponse } from '../../content/types';

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
    ) {
        try {
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
                        errorMessage =
                            'Invalid or missing license key. Please check your license settings.';
                        break;
                    case 429:
                        errorMessage =
                            'Daily usage limit exceeded. License will reset at midnight UTC.';
                        break;
                    default:
                        errorMessage = `Server error (${response.status}). Please try again later.`;
                }

                sendResponse({
                    success: false,
                    error: errorMessage,
                });
                return;
            }

            const responseJson = await response.json();

            sendResponse({
                success: true,
                data: responseJson.data,
            });
        } catch (error) {
            console.error('ProductInfoHandler error:', error);

            sendResponse({
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Network error. Please check your connection.',
            });
        }
    }
}
