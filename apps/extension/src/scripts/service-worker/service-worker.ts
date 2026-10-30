import { browser } from "webextension-polyfill-ts";
import { log } from "../../utils/logger";
import type { BackgroundMessage } from "../content/types";
import { signOutExtension } from "./extension-auth";
import { handleClearCache } from "./handlers/clear-cache";
import { handleFetchProductHistory } from "./handlers/fetch-product-history";
import { handleFetchProductInfo } from "./handlers/fetch-product-info";
import { handleGetAuthState } from "./handlers/get-auth-state";
import { handleOpenAccount } from "./handlers/open-account";
import { handlePing } from "./handlers/ping";
import { handleRecordKeywordSearch } from "./handlers/record-keyword-search";
import { handleToggleDebugMode } from "./handlers/toggle-debug-mode";

log.ready("Background Service Worker Loaded");

browser.runtime.onInstalled.addListener(() => {
	log.success("Extension installed");
});

// Handle messages from popup and content scripts
browser.runtime.onMessage.addListener((message: BackgroundMessage, _sender) => {
	log.info("Received message:", message);

	switch (message.type) {
		case "recordKeywordSearch":
			return handleRecordKeywordSearch(message.term);
		case "ping":
			return Promise.resolve(handlePing(message));

		case "fetchProductInfo":
			return handleFetchProductInfo(message);

		case "fetchProductHistory":
			return handleFetchProductHistory(message);

		case "signOut":
			return signOutExtension()
				.then(() => ({ success: true }))
				.catch(() => ({
					success: false,
					error: "Sign-out could not be completed.",
				}));
		case "getAuthState":
			return handleGetAuthState(message);

		case "openAccount":
			return handleOpenAccount(message);

		case "toggleDebugMode":
			return handleToggleDebugMode(message);

		case "clearCache":
			return handleClearCache(message);

		default:
			log.warn("Unknown message type:", message);
			return Promise.resolve(null);
	}
});
