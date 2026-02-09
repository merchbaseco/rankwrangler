import { browser } from "webextension-polyfill-ts";
import { log } from "./logger";

export const sendMessageToBackground = async (message: any): Promise<any> => {
	try {
		return await browser.runtime.sendMessage(message);
	} catch (error) {
		log.error("Failed to send message to background:", error);
		return null;
	}
};

export const sendMessageToContentScript = async (
	message: any,
): Promise<any> => {
	try {
		const tabs = await browser.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tabs[0]?.id) {
			log.error("No active tab found");
			return null;
		}
		return await browser.tabs.sendMessage(tabs[0].id, message);
	} catch (error) {
		log.error("Failed to send message to content script:", error);
		return null;
	}
};
