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

    private async initializeStats(): Promise<void> {
        const result = await chrome.storage.local.get(['stats']);
        if (!result.stats) {
            await chrome.storage.local.set({
                stats: {
                    totalRequests: 0,
                    liveSuccessCount: 0,
                    cacheSuccessCount: 0,
                    failureCount: 0,
                } as Stats,
            });
        }
    }

    async getStats(): Promise<Stats> {
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

    async handleGetStats(sendResponse: (response: StatsResponse) => void): Promise<void> {
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

    async handleResetStats(sendResponse: (response: StatsResponse) => void): Promise<void> {
        try {
            const resetStats: Stats = {
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

            // Broadcast queue count to all listeners
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
