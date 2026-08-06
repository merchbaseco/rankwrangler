import type { ReactNode } from "react";
import type { Product } from "@/scripts/types/product";
import { ProductHistoryPopover } from "./product-history-popover";
import { ProductHistorySection } from "./product-history-section";

const TRAILING_ZEROES_REGEX = /\.?0+$/;

export const ProductContent = ({
	copyStatus,
	isRefreshing,
	mode,
	onCopyAsin,
	onRefresh,
	product,
	refreshError,
}: {
	copyStatus: "idle" | "copying" | "copied";
	isRefreshing: boolean;
	mode: "detail" | "search";
	onCopyAsin: (asin: string) => Promise<void>;
	onRefresh?: () => void;
	product: Product;
	refreshError: string | null;
}) => {
	const productIdentifier = {
		asin: product.asin,
		marketplaceId: product.marketplaceId,
	};
	const contentProps = {
		copyStatus,
		creationDate: product.creationDate,
		isRefreshing,
		mode,
		onCopyAsin,
		onRefresh,
		product,
		productIdentifier,
		refreshError,
	};

	if (
		typeof product.rootCategoryBsr !== "number" ||
		product.rootCategoryDisplayName == null
	) {
		return <ProductWithoutRank {...contentProps} />;
	}

	return <ProductWithRank {...contentProps} />;
};

interface ProductContentProps {
	copyStatus: "idle" | "copying" | "copied";
	creationDate?: string;
	isRefreshing: boolean;
	mode: "detail" | "search";
	onCopyAsin: (asin: string) => Promise<void>;
	onRefresh?: () => void;
	product: Product;
	productIdentifier: { asin: string; marketplaceId: string };
	refreshError: string | null;
}

const ProductWithoutRank = ({
	copyStatus,
	creationDate,
	isRefreshing,
	mode,
	onCopyAsin,
	onRefresh,
	product,
	productIdentifier,
	refreshError,
}: ProductContentProps) => (
	<ProductCardShell>
		<div className="flex items-baseline gap-0.5">
			<span className="whitespace-nowrap font-medium text-gray-800 text-sm">
				No rank data
			</span>
			{product.rootCategoryDisplayName ? (
				<span className="ml-1 line-clamp-1 text-gray-600 text-xs">
					in {product.rootCategoryDisplayName}
				</span>
			) : null}
		</div>
		<ProductMetadataRow
			copyStatus={copyStatus}
			creationDate={creationDate}
			mode={mode}
			onCopyAsin={onCopyAsin}
			product={product}
			productIdentifier={productIdentifier}
		/>
		{mode === "detail" ? (
			<ProductFreshnessRow
				isRefreshing={isRefreshing}
				onRefresh={onRefresh}
				product={product}
				refreshError={refreshError}
			/>
		) : null}
		{mode === "detail" ? (
			<ProductHistorySection
				compact={true}
				enabled={true}
				productIdentifier={productIdentifier}
			/>
		) : null}
	</ProductCardShell>
);

const ProductWithRank = ({
	copyStatus,
	creationDate,
	isRefreshing,
	mode,
	onCopyAsin,
	onRefresh,
	product,
	productIdentifier,
	refreshError,
}: ProductContentProps) => (
	<ProductCardShell>
		<div className="flex items-baseline gap-0.5 text-green-700">
			<span className="whitespace-nowrap font-semibold text-base text-gray-800">
				#{formatBSR(product.rootCategoryBsr as number)}
			</span>
			<span className="ml-1 line-clamp-1 text-gray-600 text-xs">
				in {product.rootCategoryDisplayName}
			</span>
		</div>
		<ProductMetadataRow
			copyStatus={copyStatus}
			creationDate={creationDate}
			mode={mode}
			onCopyAsin={onCopyAsin}
			product={product}
			productIdentifier={productIdentifier}
		/>
		{mode === "detail" ? (
			<ProductFreshnessRow
				isRefreshing={isRefreshing}
				onRefresh={onRefresh}
				product={product}
				refreshError={refreshError}
			/>
		) : null}
		{mode === "detail" ? (
			<ProductHistorySection
				compact={true}
				enabled={true}
				productIdentifier={productIdentifier}
			/>
		) : null}
	</ProductCardShell>
);

const ProductCardShell = ({ children }: { children: ReactNode }) => (
	<div className="fade-in z-[1] flex w-full animate-in flex-col gap-1.5 rounded-lg border border-gray-200 bg-gradient-to-r from-white/[0.98] to-white/[0.95] px-3 py-2 shadow-sm backdrop-blur duration-300">
		{children}
	</div>
);

const ProductMetadataRow = ({
	copyStatus,
	creationDate,
	mode,
	onCopyAsin,
	product,
	productIdentifier,
}: Pick<
	ProductContentProps,
	| "copyStatus"
	| "creationDate"
	| "mode"
	| "onCopyAsin"
	| "product"
	| "productIdentifier"
>) => (
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
			onClick={() => onCopyAsin(product.asin)}
			title="Click to copy ASIN"
			type="button"
		>
			{copyStatus === "copied" ? "Copied!" : product.asin}
		</button>
	</div>
);

const ProductFreshnessRow = ({
	isRefreshing,
	onRefresh,
	product,
	refreshError,
}: {
	isRefreshing: boolean;
	onRefresh?: () => void;
	product: Product;
	refreshError: string | null;
}) => {
	const updatedLabel = product.freshness.updatedAt
		? new Date(product.freshness.updatedAt).toLocaleDateString()
		: "never";
	let actionLabel = "Refresh";
	if (refreshError) {
		actionLabel = "Retry";
	}
	if (isRefreshing) {
		actionLabel = "Refreshing…";
	}

	return (
		<div className="mt-1 flex w-full items-center gap-2 border-gray-200 border-t pt-1.5">
			<span className="flex-1 text-gray-600 text-xs">
				Product updated · {updatedLabel}
			</span>
			<button
				className="cursor-pointer rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 text-xs transition-colors hover:bg-gray-200 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
				disabled={isRefreshing}
				onClick={onRefresh}
				title={refreshError ?? "Refresh Product details"}
				type="button"
			>
				{actionLabel}
			</button>
		</div>
	);
};

const formatBSR = (bsr: number): string => {
	if (bsr >= 1_000_000) {
		const millions = bsr / 1_000_000;
		return `${millions.toFixed(2).replace(TRAILING_ZEROES_REGEX, "")}M`;
	}
	return bsr.toLocaleString();
};
