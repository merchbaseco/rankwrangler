/// <reference types="chrome"/>
interface GetStatsRequest {
	type: "getStats";
}

interface ResetStatsRequest {
	type: "resetStats";
}

interface UpdateQueueRequest {
	type: "updateQueue";
	action: "add" | "remove" | "clear";
	asin?: string;
}

interface FetchProductInfoRequest {
	type: "fetchProductInfo";
	asin: string;
	marketplaceId: string;
}

type Message =
	| GetStatsRequest
	| ResetStatsRequest
	| UpdateQueueRequest
	| FetchProductInfoRequest;

interface Stats {
	totalRequests: number;
	liveSuccessCount: number;
	cacheSuccessCount: number;
	failureCount: number;
}

// Track active requests
const activeQueue = new Set<string>();

// Initialize statistics in storage
chrome.storage.local.get(["stats"], (result) => {
	if (!result.stats) {
		chrome.storage.local.set({
			stats: {
				totalRequests: 0,
				liveSuccessCount: 0,
				cacheSuccessCount: 0,
				failureCount: 0,
			},
		});
	}
});

// Function to broadcast queue count to all popups
function broadcastQueueCount() {
	chrome.runtime.sendMessage({ type: "queueUpdate", count: activeQueue.size });
}

// Listen for messages from the content script
chrome.runtime.onMessage.addListener(
	(
		request: Message,
		sender: chrome.runtime.MessageSender,
		sendResponse: (
			response:
				| {
						html?: string;
						error?: string;
						stats?: Stats;
						queueCount?: number;
						success?: boolean;
						data?: any;
				  }
				| Record<string, string>,
		) => void,
	) => {
		if (request.type === "resetStats") {
			chrome.storage.local.set(
				{
					stats: {
						totalRequests: 0,
						liveSuccessCount: 0,
						cacheSuccessCount: 0,
						failureCount: 0,
					},
				},
				() => {
					sendResponse({});
				},
			);
			return true;
		}

		if (request.type === "updateQueue") {
			if (request.action === "add" && request.asin) {
				activeQueue.add(request.asin);
			} else if (request.action === "remove" && request.asin) {
				activeQueue.delete(request.asin);
			} else if (request.action === "clear") {
				activeQueue.clear();
			}
			broadcastQueueCount();
			sendResponse({ queueCount: activeQueue.size });
			return true;
		}


		if (request.type === "fetchProductInfo") {
			// Update stats - increment total requests
			chrome.storage.local.get(["stats"], (result) => {
				const stats: Stats = result.stats || {
					totalRequests: 0,
					liveSuccessCount: 0,
					cacheSuccessCount: 0,
					failureCount: 0,
				};
				stats.totalRequests++;
				chrome.storage.local.set({ stats });
			});
			
			// Get license key from storage and make request
			chrome.storage.sync.get(['licenseKey'], (result) => {
				const headers: Record<string, string> = {
					"Content-Type": "application/json",
				};
				
				// Add authorization header if license key exists
				if (result.licenseKey) {
					headers.Authorization = `Bearer ${result.licenseKey}`;
				}
				
				fetch("https://merchbase.co/api/getProductInfo", {
					method: "POST",
					headers,
					body: JSON.stringify({
						asin: request.asin,
						marketplaceId: request.marketplaceId,
					}),
				})
					.then(async (response) => {
						if (!response.ok) {
							// Handle different HTTP error codes
							if (response.status === 401) {
								throw new Error("Invalid or missing license key. Please check your license settings.");
							} else if (response.status === 429) {
								throw new Error("Daily usage limit exceeded. License will reset at midnight UTC.");
							} else {
								throw new Error(`Server error (${response.status}). Please try again later.`);
							}
						}
						return response.json();
					})
					.then((response) => {
						if (response.success && response.data) {
							// Update success stats
							chrome.storage.local.get(["stats"], (result) => {
								const stats: Stats = result.stats || {
									totalRequests: 0,
									liveSuccessCount: 0,
									cacheSuccessCount: 0,
									failureCount: 0,
								};
								
								// Check if data was cached using the cached flag
								if (response.data.metadata.cached) {
									stats.cacheSuccessCount++;
								} else {
									stats.liveSuccessCount++;
								}
								
								chrome.storage.local.set({ stats });
							});
							
							sendResponse({ success: true, data: response.data });
						} else {
							// Update failure stats
							chrome.storage.local.get(["stats"], (result) => {
								const stats: Stats = result.stats || {
									totalRequests: 0,
									liveSuccessCount: 0,
									cacheSuccessCount: 0,
									failureCount: 0,
								};
								stats.failureCount++;
								chrome.storage.local.set({ stats });
							});
							
							// Provide more specific error messages
							let errorMessage = response.error || "API returned error";
							if (errorMessage.includes("license")) {
								errorMessage = "License issue: " + errorMessage + " Please check your license settings.";
							} else if (errorMessage.includes("limit") || errorMessage.includes("quota")) {
								errorMessage = "Usage limit reached: " + errorMessage;
							}
							
							sendResponse({ success: false, error: errorMessage });
						}
					})
					.catch((error) => {
						// Update failure stats
						chrome.storage.local.get(["stats"], (result) => {
							const stats: Stats = result.stats || {
								totalRequests: 0,
								liveSuccessCount: 0,
								cacheSuccessCount: 0,
								failureCount: 0,
							};
							stats.failureCount++;
							chrome.storage.local.set({ stats });
						});
						
						sendResponse({ success: false, error: error.message });
					});
			});
			return true;
		}

		if (request.type === "getStats") {
			chrome.storage.local.get(["stats"], (result) => {
				sendResponse({ stats: result.stats, queueCount: activeQueue.size });
			});
			return true;
		}
	},
);
