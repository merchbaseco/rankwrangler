import { log } from '../../../utils/logger';
import type { ToggleDebugModeMessage } from '../../content/types';

export const handleToggleDebugMode = async (
    message: ToggleDebugModeMessage,
    sendResponse: (response?: any) => void
) => {
    try {
        log.debug('Handling toggle debug mode:', { debugMode: message.debugMode });

        // Query all Amazon tabs to send the message to content scripts
        const tabs = await chrome.tabs.query({
            url: [
                'https://www.amazon.com/*',
                'https://amazon.com/*'
            ]
        });

        log.debug(`Found ${tabs.length} Amazon tabs to notify`);

        // Send message to all Amazon content scripts
        const promises = tabs.map(async (tab) => {
            if (tab.id) {
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        type: 'toggleDebugMode',
                        debugMode: message.debugMode
                    });
                    log.debug(`Sent debug mode toggle to tab ${tab.id}`);
                } catch (error) {
                    // Content script might not be loaded, this is okay
                    log.debug(`Could not send to tab ${tab.id}:`, error);
                }
            }
        });

        // Wait for all messages to be sent
        await Promise.allSettled(promises);

        sendResponse({ success: true, tabsNotified: tabs.length });
    } catch (error) {
        log.error('Error handling toggle debug mode:', error);
        sendResponse({ success: false, error: error.message });
    }
};