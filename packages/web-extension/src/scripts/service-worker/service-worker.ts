import { browser } from "webextension-polyfill-ts";
import { log } from "../../utils/logger";
import type { BackgroundMessage } from "../content/types";
import { handleFetchProductInfo } from "./handlers/fetch-product-info";
import { handleGetLicenseStatus } from "./handlers/get-license-status";
import { handlePing } from "./handlers/ping";
import { handleRemoveLicense } from "./handlers/remove-license";
import { handleSetLicense } from "./handlers/set-license";
import { handleToggleDebugMode } from "./handlers/toggle-debug-mode";
import { handleValidateLicense } from "./handlers/validate-license";

log.ready("Background Service Worker Loaded");

browser.runtime.onInstalled.addListener(() => {
	log.success("Extension installed");
});

// Handle messages from popup and content scripts
browser.runtime.onMessage.addListener(
	async (message: BackgroundMessage, _sender) => {
		log.info("Received message:", message);

		switch (message.type) {
			case "ping":
				return handlePing(message);

			case "fetchProductInfo":
				return handleFetchProductInfo(message);

			case "validateLicense":
				return handleValidateLicense(message);

			case "setLicense":
				return handleSetLicense(message);

			case "removeLicense":
				return handleRemoveLicense(message);

			case "getLicenseStatus":
				return handleGetLicenseStatus(message);

			case "toggleDebugMode":
				return handleToggleDebugMode(message);

			default:
				log.warn("Unknown message type:", message);
				return null;
		}
	},
);
