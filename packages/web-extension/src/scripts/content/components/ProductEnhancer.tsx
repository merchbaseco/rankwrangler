import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useBSRCache } from "../hooks/useBSRCache";
import { useProductInfo } from "../hooks/useProductInfo";
import { useProductObserver } from "../hooks/useProductObserver";
import { BSRDisplay } from "./BSRDisplay";
import { LoadingIndicator } from "./LoadingIndicator";

interface ProductInfoWrapperProps {
	asin: string;
	element: HTMLElement;
}

/**
 * Wrapper component for individual product BSR fetching and display
 */
function ProductInfoWrapper({ asin, element }: ProductInfoWrapperProps) {
	const { data, isLoading, error } = useProductInfo(asin);
	const { getCached } = useBSRCache();
	const [cachedData, setCachedData] = useState<any>(null);

	// Check cache on mount
	useEffect(() => {
		getCached(asin).then(setCachedData);
	}, [asin, getCached]);

	const handleCopyAsin = useCallback((asin: string) => {
		console.log(`[RankWrangler] Copied ASIN: ${asin}`);
	}, []);

	// Use cached data if available, otherwise use fresh data
	const displayData =
		cachedData ||
		(data && data.bsr && data.creationDate
			? {
					rank: data.bsr.toLocaleString(),
					category: "Clothing",
					dateFirstAvailable: new Date(data.creationDate).toLocaleDateString(
						"en-US",
						{
							year: "numeric",
							month: "long",
							day: "numeric",
						},
					),
				}
			: null);

	if (isLoading && !cachedData) {
		return <LoadingIndicator message="Loading BSR..." size="sm" />;
	}

	if (error && !cachedData) {
		return (
			<div className="bg-gradient-to-r from-red-50/95 to-red-50/90 backdrop-blur border border-red-200 rounded-lg px-3 py-2 shadow-sm">
				<span className="text-sm font-medium text-red-600">
					{error.includes("license")
						? "License required"
						: "Unable to fetch rank"}
				</span>
			</div>
		);
	}

	if (!displayData) {
		return (
			<div className="bg-gradient-to-r from-gray-50/95 to-gray-50/90 backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
				<span className="text-sm font-medium text-gray-600">No rank data</span>
			</div>
		);
	}

	return (
		<BSRDisplay
			asin={asin}
			rank={displayData.rank}
			category={displayData.category}
			dateFirstAvailable={displayData.dateFirstAvailable}
			onCopyAsin={handleCopyAsin}
		/>
	);
}

/**
 * Main ProductEnhancer component that coordinates BSR functionality
 * Observes Amazon products and injects BSR displays
 */
export function ProductEnhancer() {
	const reactRootsRef = useRef<Map<string, Root>>(new Map());

	const findBestInsertionPoint = useCallback(
		(element: HTMLElement): HTMLElement | null => {
			const asin = element.getAttribute("data-asin");
			console.log(`[RankWrangler] 🎯 Finding insertion point for ASIN: ${asin}`);

			// Find the title recipe container (just like old code)
			const titleRecipeContainer = element.querySelector(
				'div[data-cy="title-recipe"]',
			) as HTMLElement;
			console.log(`[RankWrangler] 🔍 title-recipe container:`, titleRecipeContainer);

			if (titleRecipeContainer?.parentElement) {
				console.log(`[RankWrangler] ✅ Found parent of title-recipe:`, titleRecipeContainer.parentElement);
				return titleRecipeContainer.parentElement;
			}

			console.log(`[RankWrangler] ❌ No title-recipe container found for ASIN: ${asin}`);
			return null;
		},
		[],
	);

	const handleProductAdded = useCallback(
		(asin: string, element: HTMLElement) => {
			console.log(`[RankWrangler] 🔍 Attempting to process ASIN: ${asin}`);
			
			// Skip if already processed
			if (element.querySelector(".rw-container")) {
				console.log(`[RankWrangler] ⏭️  ASIN ${asin} already has BSR display`);
				return;
			}

			const insertionPoint = findBestInsertionPoint(element);
			console.log(`[RankWrangler] 📍 Insertion point for ${asin}:`, insertionPoint);
			
			if (!insertionPoint) {
				console.warn(
					`[RankWrangler] ❌ No insertion point found for ASIN: ${asin}`,
				);
				console.log(`[RankWrangler] 🔍 Element structure for ${asin}:`, element);
				return;
			}

			// Create container for React component
			const container = document.createElement("div");
			container.className = "rw-container";
			container.style.cssText =
				"margin: 6px 0; z-index: 1; position: relative;";

			// Insert as first child (like old code)
			insertionPoint.insertBefore(container, insertionPoint.firstChild);

			// Create React root and render component
			const root = createRoot(container);
			root.render(<ProductInfoWrapper asin={asin} element={element} />);

			reactRootsRef.current.set(asin, root);

			console.log(`[RankWrangler] ✅ Successfully processed ASIN: ${asin}`);
		},
		[findBestInsertionPoint],
	);

	const handleProductRemoved = useCallback(
		(asin: string, element: HTMLElement) => {
			// Clean up React root
			const root = reactRootsRef.current.get(asin);
			if (root) {
				root.unmount();
				reactRootsRef.current.delete(asin);
			}

			// Remove any remaining BSR containers
			const containers = element.querySelectorAll(".rw-container");
			containers.forEach((container) => container.remove());

			console.log(`[RankWrangler] 🧹 Cleaned up ASIN: ${asin}`);
		},
		[],
	);

	const handlePageChanged = useCallback(() => {
		// Clean up all React roots
		reactRootsRef.current.forEach((root) => {
			root.unmount();
		});
		reactRootsRef.current.clear();

		// Remove all BSR containers
		document.querySelectorAll(".rw-container").forEach((container) => {
			container.remove();
		});

		console.log(`[RankWrangler] 🔄 Page changed, cleaned up all displays`);
	}, []);

	// Start observing products
	const { processedCount } = useProductObserver({
		onProductAdded: handleProductAdded,
		onProductRemoved: handleProductRemoved,
		onPageChanged: handlePageChanged,
	});

	// This component doesn't render anything visible itself
	// All UI is injected directly into the Amazon page
	return null;
}
