import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "webextension-polyfill-ts";
import styles from "@/styles/index.css?inline";
import { log } from "../../utils/logger";
import { ProductCache } from "../db/product-cache";
import { ProductRequestTracker } from "../db/product-request-tracker";
import App from "./app";

console.log("RankWrangler content script loading...");

// Clear any stale product requests from previous sessions
ProductRequestTracker.clearAllRequests().catch((error: unknown) => {
	log.error("Failed to clear stale product requests:", { error });
});

const isProduction: boolean = process.env.NODE_ENV === "production";
const ROOT_ID = "rankwrangler-content-root";

const injectReact = (rootId: string): void => {
	try {
		const container = document.createElement("div");
		document.body.appendChild(container);

		if (container) {
			container.id = rootId;
			container.style.position = "inherit";
			container.style.zIndex = "2147483666";
		}

		if (isProduction) {
			log.ready("Content script loaded (production)");
			container.attachShadow({ mode: "open" });
		} else {
			log.ready("Content script loaded (development)");
		}

		const target: ShadowRoot | HTMLElement = isProduction
			? container.shadowRoot
			: container;

		const root = createRoot(target);

		root.render(
			<StrictMode>
				{isProduction && <style>{styles.toString()}</style>}
				<App />
			</StrictMode>,
		);
	} catch (error: unknown) {
		log.error("Failed to inject React:", { error });
	}
};

// Keep ping functionality for other extension features
console.log("Registering runtime message listener");
browser.runtime.onMessage.addListener(
	(
		message: { type: string; cacheSize?: number; queueCount?: number },
		_sender: any,
	) => {
		if (message.type === "ping") {
			return Promise.resolve({ alive: true });
		}

		if (message.type === "cacheCleared") {
			log.info("Cache cleared notification received in content script", {
				cacheSize: message.cacheSize,
				queueCount: message.queueCount,
			});

			return Promise.all([
				ProductCache.clearCache(),
				ProductRequestTracker.clearAllRequests(),
			])
				.then(() => ({ acknowledged: true }))
				.catch((error: unknown) => {
					log.error(
						"Failed to clear local caches after cacheCleared notification",
						{ error },
					);

					return {
						acknowledged: false,
						error:
							error instanceof Error
								? error.message
								: "Failed to clear local caches",
					};
				});
		}

		return undefined;
	},
);

injectReact(ROOT_ID);
