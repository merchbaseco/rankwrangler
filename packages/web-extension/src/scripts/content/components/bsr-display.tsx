import { useState } from "react";

/**
 * BSR Display component showing rank, category, date, and ASIN
 * Includes copy-to-clipboard functionality for ASIN
 */
export function BSRDisplay({
	asin,
	rank,
	category,
	dateFirstAvailable,
	isLoading = false,
	error,
	onCopyAsin,
}: {
	asin: string;
	rank: string;
	category: string;
	dateFirstAvailable: string;
	isLoading?: boolean;
	error?: string;
	onCopyAsin?: (asin: string) => void;
}) {
	const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied">(
		"idle",
	);

	const handleCopyAsin = async () => {
		if (copyStatus !== "idle") return;

		setCopyStatus("copying");

		try {
			await navigator.clipboard.writeText(asin);
			setCopyStatus("copied");
			onCopyAsin?.(asin);

			setTimeout(() => {
				setCopyStatus("idle");
			}, 1500);
		} catch (error) {
			console.error("Failed to copy ASIN:", error);
			setCopyStatus("idle");
		}
	};

	if (isLoading) {
		return (
			<div className="bg-gradient-to-r from-white/95 to-white/90 backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-pulse">
				<div className="flex items-center gap-2">
					<div className="w-4 h-4 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
					<span className="text-sm font-medium text-gray-800">
						Loading BSR...
					</span>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-in fade-in duration-300 max-w-fit z-[1]">
				<span className="text-red-600 text-sm font-medium">Unable to fetch rank</span>
			</div>
		);
	}

	if (!rank || rank === "0") {
		return (
			<div className="bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-in fade-in duration-300 max-w-fit z-[1]">
				<span className="text-gray-800 text-sm font-medium">No rank data</span>
			</div>
		);
	}

	return (
		<div className="bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-in fade-in duration-300 max-w-fit z-[1] flex flex-col gap-1.5">
			{/* BSR Rank and Category - matches .rw-success */}
			<div className="text-green-700 flex items-baseline gap-0.5">
				<span className="text-base font-semibold text-gray-800">#{rank}</span>
				<span className="text-xs text-gray-600 ml-1">in {category}</span>
			</div>

			{/* Metadata: Date and ASIN - matches .rw-meta */}
			<div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-gray-200 w-full">
				<span className="text-xs text-gray-600 flex-1">
					{dateFirstAvailable}
				</span>

				<button
					type="button"
					onClick={handleCopyAsin}
					className="text-xs text-gray-600 cursor-pointer px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 hover:text-gray-800 transition-all duration-200"
					title="Click to copy ASIN"
					disabled={copyStatus !== "idle"}
				>
					{copyStatus === "copied" ? "Copied!" : asin}
				</button>
			</div>
		</div>
	);
}
