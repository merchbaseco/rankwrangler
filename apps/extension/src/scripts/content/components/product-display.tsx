import { useState } from "react";
import type { Product } from "@/scripts/types/product";
import { log } from "../../../utils/logger";
import { ProductContent } from "./product-display-content";

export function ProductDisplay({
	product,
	isLoading = false,
	isError = false,
	isRefreshing = false,
	mode,
	onRefresh,
	refreshError = null,
}: {
	product?: Product;
	isLoading?: boolean;
	isError?: boolean;
	isRefreshing?: boolean;
	mode: "detail" | "search";
	onRefresh?: () => void;
	refreshError?: string | null;
}) {
	const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied">(
		"idle"
	);

	const handleCopyAsin = async (asin: string) => {
		if (copyStatus !== "idle") {
			return;
		}

		setCopyStatus("copying");
		try {
			await navigator.clipboard.writeText(asin);
			setCopyStatus("copied");
			setTimeout(() => setCopyStatus("idle"), 1500);
		} catch (error) {
			log.error("Failed to copy ASIN:", error);
			setCopyStatus("idle");
		}
	};

	if (isError) {
		return (
			<ProductErrorDisplay
				isRefreshing={isRefreshing}
				mode={mode}
				onRefresh={onRefresh}
				refreshError={refreshError}
			/>
		);
	}

	if (isLoading || !product) {
		return <ProductSkeleton />;
	}

	return (
		<ProductContent
			copyStatus={copyStatus}
			isRefreshing={isRefreshing}
			mode={mode}
			onCopyAsin={handleCopyAsin}
			onRefresh={onRefresh}
			product={product}
			refreshError={refreshError}
		/>
	);
}

const ProductErrorDisplay = ({
	isRefreshing,
	mode,
	onRefresh,
	refreshError,
}: {
	isRefreshing: boolean;
	mode: "detail" | "search";
	onRefresh?: () => void;
	refreshError: string | null;
}) => (
	<div className="fade-in z-[1] w-full animate-in rounded-lg border border-gray-200 bg-gradient-to-r from-white/[0.98] to-white/[0.95] px-3 py-2 shadow-sm backdrop-blur duration-300">
		<div className="flex items-center justify-between gap-2">
			<span className="font-medium text-red-600 text-sm">
				Unable to fetch rank
			</span>
			{mode === "detail" && onRefresh ? (
				<button
					className="cursor-pointer rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 text-xs hover:bg-gray-200 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
					disabled={isRefreshing}
					onClick={onRefresh}
					type="button"
				>
					{isRefreshing ? "Refreshing…" : "Retry"}
				</button>
			) : null}
		</div>
		{refreshError ? (
			<span className="text-gray-500 text-xs">{refreshError}</span>
		) : null}
	</div>
);

const ProductSkeleton = () => (
	<div className="flex w-full flex-col gap-1.5 rounded-lg border border-gray-200 bg-gradient-to-r from-white/[0.98] to-white/[0.95] px-3 py-2 shadow-sm backdrop-blur">
		<div className="flex items-baseline gap-0.5">
			<span className="animate-pulse whitespace-nowrap rounded bg-gray-200 font-semibold text-base text-transparent">
				#123,456
			</span>
			<span className="ml-1 animate-pulse rounded bg-gray-200 text-transparent text-xs">
				in Example Category
			</span>
		</div>
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
