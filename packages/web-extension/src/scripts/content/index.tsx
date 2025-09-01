import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "webextension-polyfill-ts";
import styles from "@/styles/index.css?inline";
import { log } from "../../utils/logger";
import { ProductRequestTracker } from "../db/product-request-tracker";
import App from "./app";

console.log("RankWrangler content script loading...");

// Clear any stale product requests from previous sessions
ProductRequestTracker.clearAllRequests().catch((error) => {
	log.error("Failed to clear stale product requests:", error);
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
	} catch (error) {
		log.error("Failed to inject React:", error);
	}
};

// Keep ping functionality for other extension features
console.log("Registering ping message listener");
browser.runtime.onMessage.addListener(
	(message: { type: string }, _sender: any) => {
		if (message.type === "ping") {
			return Promise.resolve({ alive: true });
		}
	},
);

injectReact(ROOT_ID);
