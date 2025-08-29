import type { Stats, StatsResponse, UpdateQueueMessage } from '../../content/types';

export class StatsHandler {
    private static instance: StatsHandler;
    private activeQueue = new Set<string>();

    static getInstance(): StatsHandler {
        if (!StatsHandler.instance) {
            StatsHandler.instance = new StatsHandler();
            StatsHandler.instance.initializeStats();
        }
        return StatsHandler.instance;
    }

    private async initializeStats() {
        const result = await chrome.storage.local.get(['stats', 'activeQueue']);
        if (!result.stats) {
            await chrome.storage.local.set({
                stats: {
                    totalRequests: 0,
                    liveSuccessCount: 0,
                    cacheSuccessCount: 0,
                    failureCount: 0,
                },
            });
        }
        if (!result.activeQueue) {
            await chrome.storage.local.set({
                activeQueue: {
                    count: 0,
                    timestamp: Date.now()
                }
            });
        }
    }

    async getStats() {
        const result = await chrome.storage.local.get(['stats']);
        return (
            result.stats || {
                totalRequests: 0,
                liveSuccessCount: 0,
                cacheSuccessCount: 0,
                failureCount: 0,
            }
        );
    }

    async handleGetStats(sendResponse: (response: StatsResponse) => void) {
        try {
            const stats = await this.getStats();
            sendResponse({
                stats,
                queueCount: this.activeQueue.size,
            });
        } catch (error) {
            console.error('StatsHandler getStats error:', error);
            sendResponse({});
        }
    }

    async handleResetStats(sendResponse: (response: StatsResponse) => void) {
        try {
            const resetStats = {
                totalRequests: 0,
                liveSuccessCount: 0,
                cacheSuccessCount: 0,
                failureCount: 0,
            };

            await chrome.storage.local.set({ stats: resetStats });
            sendResponse({});
        } catch (error) {
            console.error('StatsHandler resetStats error:', error);
            sendResponse({});
        }
    }

    /**
     * Update the queue count in chrome.storage.local for popup to read
     */
    private updateQueueCountInStorage(): void {
        chrome.storage.local.set({
            activeQueue: {
                count: this.activeQueue.size,
                timestamp: Date.now()
            }
        });
    }

    handleUpdateQueue(
        message: UpdateQueueMessage,
        sendResponse: (response: StatsResponse) => void
    ): void {
        try {
            if (message.action === 'add' && message.asin) {
                this.activeQueue.add(message.asin);
            } else if (message.action === 'remove' && message.asin) {
                this.activeQueue.delete(message.asin);
            } else if (message.action === 'clear') {
                this.activeQueue.clear();
            }

            // Update storage for popup to read
            this.updateQueueCountInStorage();

            // Broadcast queue count to all listeners (legacy support)
            this.broadcastQueueCount();

            sendResponse({ queueCount: this.activeQueue.size });
        } catch (error) {
            console.error('StatsHandler updateQueue error:', error);
            sendResponse({ queueCount: this.activeQueue.size });
        }
    }

    private broadcastQueueCount(): void {
        // Send queue update to all tabs/popups
        chrome.runtime
            .sendMessage({
                type: 'queueUpdate',
                count: this.activeQueue.size,
            })
            .catch(() => {
                // Ignore errors when no listeners are present
            });
    }

    getQueueSize(): number {
        return this.activeQueue.size;
    }
}
