// Simple background script for Safari compatibility
console.log("RankWrangler Background Service Worker Loaded");

chrome.runtime.onInstalled.addListener(() => {
	console.log("RankWrangler extension installed");
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	console.log("Background received message:", message);

	if (message.type === "background-ping") {
		sendResponse({ alive: true });
		return true;
	}

	// Handle other message types here
	return true;
});

export {};
