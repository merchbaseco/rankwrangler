import { useState } from "react";
import type { Product } from "@/scripts/types/product";
import { log } from "../../../utils/logger";

/**
 * Product display component showing rank, category, date, and ASIN
 *
 * Includes copy-to-clipboard functionality for ASIN
 */
export function ProductDisplay({
	product,
	isLoading = false,
	isError = false,
}: {
	product: Product;
	isLoading?: boolean;
	isError?: boolean;
}) {
	const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied">(
		"idle",
	);
	const [showTooltip, setShowTooltip] = useState(false);

	const handleCopyAsin = async () => {
		if (copyStatus !== "idle") return;

		setCopyStatus("copying");

		try {
			await navigator.clipboard.writeText(asin);
			setCopyStatus("copied");

			setTimeout(() => {
				setCopyStatus("idle");
			}, 1500);
		} catch (error) {
			log.error("Failed to copy ASIN:", error);
			setCopyStatus("idle");
		}
	};

	if (isError) {
		return (
			<div className="w-full bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-in fade-in duration-300 z-[1]">
				<span className="text-red-600 text-sm font-medium">
					Unable to fetch rank
				</span>
			</div>
		);
	}

	if (isLoading || !product) {
		return (
			<div className="w-full bg-gradient-to-r from-white/95 to-white/90 backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-pulse">
				<div className="flex items-center gap-2">
					<div className="w-4 h-4 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
					<span className="text-sm font-medium text-gray-800">
						Loading BSR...
					</span>
				</div>
			</div>
		);
	}

	const { asin, bsr, bsrCategory, classificationRanks, creationDate } = product;
	
	if (!bsr || !bsrCategory) {
		return (
			<div className="w-full bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-in fade-in duration-300 z-[1]">
				<span className="text-gray-800 text-sm font-medium">No rank data</span>
			</div>
		);
	}

	return (
		<div className="w-full bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-in fade-in duration-300 z-[1] flex flex-col gap-1.5">
			{/* BSR Rank and Category - matches .rw-success */}
			<div 
				className={`text-green-700 flex items-baseline gap-0.5 relative ${
					classificationRanks.length > 0 ? 'cursor-pointer hover:text-green-800 transition-colors duration-200' : ''
				}`}
				onMouseEnter={classificationRanks.length > 0 ? () => setShowTooltip(true) : undefined}
				onMouseLeave={classificationRanks.length > 0 ? () => setShowTooltip(false) : undefined}
			>
				<span className="text-base font-semibold text-gray-800">
					#{bsr.toLocaleString()}
				</span>
				<span className="text-xs text-gray-600 ml-1">in {bsrCategory}</span>
				{classificationRanks.length > 0 && showTooltip && (
					<div 
						className="absolute bottom-full left-0 mb-2 z-50"
						onMouseEnter={() => setShowTooltip(true)}
						onMouseLeave={() => setShowTooltip(false)}
					>
						<div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-lg min-w-max">
							<div className="space-y-1">
								<p className="font-medium text-xs text-gray-800 mb-1">Also ranked:</p>
								{classificationRanks.map((ranking, index) => (
									<div key={index} className="text-xs text-gray-700 flex items-center gap-1">
										<span className="w-1 h-1 bg-gray-400 rounded-full flex-shrink-0" />
										<span>#{ranking.rank.toLocaleString()} in {ranking.category}</span>
									</div>
								))}
							</div>
							{/* Tooltip arrow */}
							<div className="absolute top-full left-4 transform -translate-x-1/2 -mt-px">
								<div className="w-2 h-2 bg-white/95 border-r border-b border-gray-200 transform rotate-45"></div>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Metadata: Date and ASIN - matches .rw-meta */}
			<div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-gray-200 w-full">
				<span className="text-xs text-gray-600 flex-1">
					{creationDate && new Date(creationDate).toLocaleDateString("en-US", {
						year: "numeric",
						month: "long",
						day: "numeric",
					})}
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
