import { log } from '../../../utils/logger';
import type { StatsResponse } from '../types';

export class ApiService {
    private static instance: ApiService;

    static getInstance(): ApiService {
        if (!ApiService.instance) {
            ApiService.instance = new ApiService();
        }
        return ApiService.instance;
    }

    /**
     * Checks if the service worker is alive
     * @returns Promise resolving to true if alive, false otherwise
     */
    async ping(): Promise<boolean> {
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'ping' }, response => {
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
