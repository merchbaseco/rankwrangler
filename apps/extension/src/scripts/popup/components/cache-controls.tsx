import { useEffect, useState } from "react";
import { browser } from "webextension-polyfill-ts";
import { Button } from "@/components/ui/button";
import type { ClearCacheResponse } from "@/scripts/content/types";

type CacheStatus = "idle" | "clearing" | "success" | "error";

export const CacheControls = () => {
	const [status, setStatus] = useState<CacheStatus>("idle");
	const [message, setMessage] = useState<string>("");

	useEffect(() => {
		if (status === "success") {
			const timeout = window.setTimeout(() => {
				setStatus("idle");
				setMessage("");
			}, 2000);
			return () => window.clearTimeout(timeout);
		}
		return undefined;
	}, [status]);

	const handleClearCache = async () => {
		if (status === "clearing") return;

		setStatus("clearing");
		setMessage("");

		try {
			const response = (await browser.runtime.sendMessage({
				type: "clearCache",
			})) as ClearCacheResponse | null;

			if (!response || !response.success) {
				const errorMessage =
					response?.error || "Failed to clear cached data. Try again.";
				setStatus("error");
				setMessage(errorMessage);
				return;
			}

			setStatus("success");
			setMessage("Cache cleared.");
		} catch (error) {
			setStatus("error");
			setMessage(
				error instanceof Error
					? error.message
					: "Unexpected error clearing cache.",
			);
		}
	};

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium text-foreground">Cache</span>
				<Button
					variant="outline"
					size="sm"
					onClick={handleClearCache}
					disabled={status === "clearing"}
				>
					{status === "clearing" ? "Clearing..." : "Clear Cache"}
				</Button>
			</div>

			{message && (
				<p
					className={`text-xs ${
						status === "error" ? "text-red-600" : "text-muted-foreground"
					}`}
				>
					{message}
				</p>
			)}
		</div>
	);
};
