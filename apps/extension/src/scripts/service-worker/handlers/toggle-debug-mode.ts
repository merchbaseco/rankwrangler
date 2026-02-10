import { browser } from "webextension-polyfill-ts";
import { log } from "../../../utils/logger";
import type { ToggleDebugModeMessage } from "../../content/types";

export const handleToggleDebugMode = async (
	message: ToggleDebugModeMessage
) => {
	try {
		log.info("Handling toggle debug mode:", { debugMode: message.debugMode });

		// Query all tabs and send message to each
		const tabs = await browser.tabs.query({});
		log.info(`Found ${tabs.length} tabs to notify`);

		// Send message to all tabs (only content scripts will receive it)
		const promises = tabs.map(async (tab) => {
			if (tab.id) {
				try {
					const response = await browser.tabs.sendMessage(tab.id, {
						type: "toggleDebugMode",
						debugMode: message.debugMode,
					});
					log.info(`Sent debug mode toggle to tab ${tab.id}`, response);
				} catch (error) {
					// Content script might not be loaded, this is normal
					log.info(`Could not send to tab ${tab.id}:`, error);
				}
			}
		});

		await Promise.allSettled(promises);
		return { success: true };
	} catch (error) {
		log.error("Error handling toggle debug mode:", error);
		return { success: false, error: error.message };
	}
};
