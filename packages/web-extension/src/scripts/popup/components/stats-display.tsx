import { useEffect, useState } from "react";
import { browser } from "webextension-polyfill-ts";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

const StatsDisplay = () => {
	const [debugMode, setDebugMode] = useState(false);

	useEffect(() => {
		// Load initial debug mode state
		browser.storage.local.get(["debugMode"]).then((result) => {
			setDebugMode(result.debugMode || false);
		});
	}, []);

	const toggleDebugMode = async () => {
		const newDebugMode = !debugMode;
		setDebugMode(newDebugMode);

		// Save to storage
		await browser.storage.local.set({ debugMode: newDebugMode });

		// Use dynamic script injection to directly update debug mode
		try {
			const tabs = await browser.tabs.query({
				url: ["https://www.amazon.com/*", "https://amazon.com/*"],
			});
			console.log(`Found ${tabs.length} Amazon tabs to notify`);

			for (const tab of tabs) {
				if (tab.id) {
					try {
						// Inject script directly to update storage and trigger change
						await browser.scripting.executeScript({
							target: { tabId: tab.id },
							func: (debugMode) => {
								// Update storage
								chrome.storage.local.set({ debugMode });
								console.log(
									"Debug mode updated via script injection:",
									debugMode,
								);

								// Dispatch custom event for React app to detect immediately
								window.dispatchEvent(
									new CustomEvent("debugModeChanged", {
										detail: { debugMode },
									}),
								);
							},
							args: [newDebugMode],
						});

						console.log(`Debug mode injected to tab ${tab.id}`);
					} catch (error) {
						console.log(`Could not inject to tab ${tab.id}:`, error);
					}
				}
			}
		} catch (error) {
			console.error("Error injecting debug mode script:", error);
		}
	};

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="text-base">Debug Mode</CardTitle>
						<CardDescription className="text-xs">
							Show extension stats on Amazon pages
						</CardDescription>
					</div>
					<button
						type="button"
						onClick={toggleDebugMode}
						className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
							debugMode ? "bg-blue-600" : "bg-gray-200"
						}`}
					>
						<span
							className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
								debugMode ? "translate-x-6" : "translate-x-1"
							}`}
						/>
					</button>
				</div>
			</CardHeader>

			{debugMode && (
				<CardContent className="pt-0">
					<div className="text-xs text-muted-foreground">
						Debug widget visible on Amazon pages showing:
						<ul className="mt-1 ml-2 space-y-1">
							<li>• Cache count</li>
							<li>• Active queue</li>
							<li>• React roots</li>
						</ul>
					</div>
				</CardContent>
			)}
		</Card>
	);
};

export default StatsDisplay;
