import type { StatsResponse, UpdateQueueMessage } from '../../content/types';

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
        const result = await chrome.storage.local.get(['activeQueue']);
        if (!result.activeQueue) {
            await chrome.storage.local.set({
                activeQueue: {
                    count: 0,
                    timestamp: Date.now()
                }
            });
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

            sendResponse({ queueCount: this.activeQueue.size });
        } catch (error) {
            console.error('StatsHandler updateQueue error:', error);
            sendResponse({ queueCount: this.activeQueue.size });
        }
    }

}
