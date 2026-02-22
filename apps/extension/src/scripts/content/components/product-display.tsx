import { useState } from "react";
import type { Product } from "@/scripts/types/product";
import { log } from "../../../utils/logger";
import { ProductHistoryPopover } from "./product-history-popover";
import { ProductHistorySection } from "./product-history-section";

const TRAILING_ZEROES_REGEX = /\.?0+$/;

/**
 * Format BSR numbers with appropriate display format
 * - Numbers < 1,000,000: Show with commas (e.g., "12,345")
 * - Numbers >= 1,000,000: Show in millions format (e.g., "1.34M")
 */
function formatBSR(bsr: number): string {
	if (bsr >= 1_000_000) {
		const millions = bsr / 1_000_000;
		return `${millions.toFixed(2).replace(TRAILING_ZEROES_REGEX, "")}M`;
	}
	return bsr.toLocaleString();
}

/**
 * Product display component showing rank, category, date, and ASIN
 *
 * Includes copy-to-clipboard functionality for ASIN
 */
export function ProductDisplay({
	product,
	isLoading = false,
	isError = false,
	mode,
}: {
	product: Product;
	isLoading?: boolean;
	isError?: boolean;
	mode: "detail" | "search";
}) {
	const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied">(
		"idle"
	);

	const handleCopyAsin = async (asinToCopy: string) => {
		if (copyStatus !== "idle") {
			return;
		}

		setCopyStatus("copying");

		try {
			await navigator.clipboard.writeText(asinToCopy);
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
			<div className="fade-in z-[1] w-full animate-in rounded-lg border border-gray-200 bg-gradient-to-r from-white/[0.98] to-white/[0.95] px-3 py-2 shadow-sm backdrop-blur duration-300">
				<span className="font-medium text-red-600 text-sm">
					Unable to fetch rank
				</span>
			</div>
		);
	}

	if (isLoading || !product) {
		return (
			<div className="flex w-full flex-col gap-1.5 rounded-lg border border-gray-200 bg-gradient-to-r from-white/[0.98] to-white/[0.95] px-3 py-2 shadow-sm backdrop-blur">
				{/* Skeleton for BSR rank and category */}
				<div className="flex items-baseline gap-0.5">
					<span className="animate-pulse whitespace-nowrap rounded bg-gray-200 font-semibold text-base text-transparent">
						#123,456
					</span>
					<span className="ml-1 animate-pulse rounded bg-gray-200 text-transparent text-xs">
						in Example Category
					</span>
				</div>

				{/* Skeleton for metadata row */}
				<div className="mt-1 flex w-full items-center gap-2 border-gray-200 border-t pt-1.5">
					<span className="flex-1 animate-pulse rounded bg-gray-200 text-transparent text-xs">
						December 31, 2024
					</span>
					<span className="animate-pulse rounded bg-gray-200 px-1.5 py-0.5 text-transparent text-xs">
						B0EXAMPLE1
					</span>
				</div>
			</div>
		);
	}

	const { asin, rootCategoryBsr, rootCategoryDisplayName, creationDate } =
		product;
	const productIdentifier = {
		asin,
		marketplaceId: product.marketplaceId,
	};
	const hasRankData =
		typeof rootCategoryBsr === "number" && rootCategoryDisplayName != null;

	if (!hasRankData) {
		return (
			<div className="fade-in z-[1] flex w-full animate-in flex-col gap-1.5 rounded-lg border border-gray-200 bg-gradient-to-r from-white/[0.98] to-white/[0.95] px-3 py-2 shadow-sm backdrop-blur duration-300">
				<div className="flex items-baseline gap-0.5">
					<span className="whitespace-nowrap font-medium text-gray-800 text-sm">
						No rank data
					</span>
					{rootCategoryDisplayName ? (
						<span className="ml-1 line-clamp-1 text-gray-600 text-xs">
							in {rootCategoryDisplayName}
						</span>
					) : null}
				</div>

				<div className="mt-1 flex w-full items-center gap-2 border-gray-200 border-t pt-1.5">
					<span className="flex-1 text-gray-600 text-xs">
						{creationDate &&
							new Date(creationDate).toLocaleDateString("en-US", {
								year: "numeric",
								month: "long",
								day: "numeric",
							})}
					</span>

					{mode === "search" ? (
						<ProductHistoryPopover
							globalHost={true}
							productIdentifier={productIdentifier}
						/>
					) : null}

					<button
						className="cursor-pointer rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 text-xs transition-all duration-200 hover:bg-gray-200 hover:text-gray-800"
						disabled={copyStatus !== "idle"}
						onClick={() => handleCopyAsin(asin)}
						title="Click to copy ASIN"
						type="button"
					>
						{copyStatus === "copied" ? "Copied!" : asin}
					</button>
				</div>

				{mode === "detail" ? (
					<ProductHistorySection
						compact={true}
						enabled={true}
						productIdentifier={productIdentifier}
					/>
				) : null}
			</div>
		);
	}

	return (
		<div className="fade-in z-[1] flex w-full animate-in flex-col gap-1.5 rounded-lg border border-gray-200 bg-gradient-to-r from-white/[0.98] to-white/[0.95] px-3 py-2 shadow-sm backdrop-blur duration-300">
			{/* BSR Rank and Category - matches .rw-success */}
			<div className="flex items-baseline gap-0.5 text-green-700">
				<span className="whitespace-nowrap font-semibold text-base text-gray-800">
					#{formatBSR(rootCategoryBsr)}
				</span>
				<span className="ml-1 line-clamp-1 text-gray-600 text-xs">
					in {rootCategoryDisplayName}
				</span>
			</div>

			{/* Metadata: Date and ASIN - matches .rw-meta */}
			<div className="mt-1 flex w-full items-center gap-2 border-gray-200 border-t pt-1.5">
				<span className="flex-1 text-gray-600 text-xs">
					{creationDate &&
						new Date(creationDate).toLocaleDateString("en-US", {
							year: "numeric",
							month: "long",
							day: "numeric",
						})}
				</span>

				{mode === "search" ? (
					<ProductHistoryPopover
						globalHost={true}
						productIdentifier={productIdentifier}
					/>
				) : null}

				<button
					className="cursor-pointer rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 text-xs transition-all duration-200 hover:bg-gray-200 hover:text-gray-800"
					disabled={copyStatus !== "idle"}
					onClick={() => handleCopyAsin(asin)}
					title="Click to copy ASIN"
					type="button"
				>
					{copyStatus === "copied" ? "Copied!" : asin}
				</button>
			</div>

			{mode === "detail" ? (
				<ProductHistorySection
					compact={true}
					enabled={true}
					productIdentifier={productIdentifier}
				/>
			) : null}
		</div>
	);
}
