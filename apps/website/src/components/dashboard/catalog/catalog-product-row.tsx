import { MerchListingBadge } from "@/components/dashboard/merch-listing-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
	getProductThumbnailUrl,
	ProductThumbnail,
} from "@/components/dashboard/product-thumbnail";
import type {
	ProductRowMouseEnter,
	ProductRowMouseMove,
} from "@/components/dashboard/product-image-tooltip";
import { formatNumber } from "@/lib/utils";
import type { CatalogResult } from "./types";
import { useCatalogProductQuery } from "./use-catalog-product-query";

export const CatalogProductRow = ({
	onRowMouseEnter,
	onRowMouseLeave,
	onRowMouseMove,
	result,
	runId,
}: {
	onRowMouseEnter: (args: ProductRowMouseEnter) => void;
	onRowMouseLeave: () => void;
	onRowMouseMove: (args: ProductRowMouseMove) => void;
	result: CatalogResult;
	runId: string;
}) => {
	const initialProduct = result.currentProduct;
	if (!initialProduct) {
		return (
			<DeletedCatalogProductRow
				onRowMouseEnter={onRowMouseEnter}
				onRowMouseLeave={onRowMouseLeave}
				onRowMouseMove={onRowMouseMove}
				result={result}
				runId={runId}
			/>
		);
	}

	return (
		<ResolvedCatalogProductRow
			initialProduct={initialProduct}
			onRowMouseEnter={onRowMouseEnter}
			onRowMouseLeave={onRowMouseLeave}
			onRowMouseMove={onRowMouseMove}
			result={result}
			runId={runId}
		/>
	);
};

const ResolvedCatalogProductRow = ({
	initialProduct,
	onRowMouseEnter,
	onRowMouseLeave,
	onRowMouseMove,
	result,
	runId,
}: {
	initialProduct: NonNullable<CatalogResult["currentProduct"]>;
	onRowMouseEnter: (args: ProductRowMouseEnter) => void;
	onRowMouseLeave: () => void;
	onRowMouseMove: (args: ProductRowMouseMove) => void;
	result: CatalogResult;
	runId: string;
}) => {
	const productQuery = useCatalogProductQuery({
		initialProduct,
		initialAmazonListingStatus: result.currentAmazonListingStatus,
	});
	const product = productQuery.data?.product ?? initialProduct;
	const current = product.keepa;
	const isProductPending =
		(productQuery.data?.amazonListingStatus ?? result.currentAmazonListingStatus) ===
		"pending";

	return (
		<TableRow
			key={`${runId}:${result.productId}`}
			onMouseEnter={(event) =>
				onRowMouseEnter({
					asin: product.asin,
					event,
					imageUrl: getProductThumbnailUrl(product.thumbnail),
					title: product.title,
				})
			}
			onMouseLeave={onRowMouseLeave}
			onMouseMove={(event) =>
				onRowMouseMove({
					event,
					imageUrl: getProductThumbnailUrl(product.thumbnail),
				})
			}
		>
			<PositionCell value={result.position.value} />
			<TableCell>
				<ProductThumbnail
					asin={product.asin}
					thumbnail={product.thumbnail}
					title={product.title}
				/>
			</TableCell>
			<TableCell className="max-w-80 whitespace-normal">
				{isProductPending ? (
					<PendingProductSummary product={product} />
				) : (
					<ProductSummary product={product} />
				)}
			</TableCell>
			<MetricCell value={result.observed.rootCategoryBsr} prefix="#" />
			<MetricCell value={current?.currentRootCategoryBsr ?? null} prefix="#" />
			<PriceCell
				amountMinor={result.observed.newPriceAmountMinor}
				currencyCode={result.observed.currencyCode}
			/>
			<PriceCell
				amountMinor={current?.currentNewPrice?.amountMinor ?? null}
				currencyCode={current?.currentNewPrice?.currencyCode ?? "USD"}
			/>
			<MetricCell value={result.observed.monthlySold} />
		</TableRow>
	);
};

const DeletedCatalogProductRow = ({
	onRowMouseEnter,
	onRowMouseLeave,
	onRowMouseMove,
	result,
	runId,
}: {
	onRowMouseEnter: (args: ProductRowMouseEnter) => void;
	onRowMouseLeave: () => void;
	onRowMouseMove: (args: ProductRowMouseMove) => void;
	result: CatalogResult;
	runId: string;
}) => (
	<TableRow
		key={`${runId}:${result.productId}`}
		onMouseEnter={(event) =>
			onRowMouseEnter({
				asin: result.productId,
				event,
				imageUrl: null,
				title: null,
			})
		}
		onMouseLeave={onRowMouseLeave}
		onMouseMove={(event) => onRowMouseMove({ event, imageUrl: null })}
	>
		<PositionCell value={result.position.value} />
		<TableCell>
			<ProductThumbnail
				asin={result.productId}
				thumbnail={{ status: "unavailable" }}
				title={null}
			/>
		</TableCell>
		<TableCell className="max-w-80 whitespace-normal">
			<div>
				<span className="text-muted-foreground">
					Amazon listing deleted
				</span>
				<div className="mt-1 font-mono text-[11px]">{result.productId}</div>
			</div>
		</TableCell>
		<MetricCell value={result.observed.rootCategoryBsr} prefix="#" />
		<MetricCell value={null} prefix="#" />
		<PriceCell
			amountMinor={result.observed.newPriceAmountMinor}
			currencyCode={result.observed.currencyCode}
		/>
		<PriceCell amountMinor={null} currencyCode="USD" />
		<MetricCell value={result.observed.monthlySold} />
	</TableRow>
);

const PendingProductSummary = ({
	product,
}: {
	product: NonNullable<CatalogResult["currentProduct"]>;
}) => (
	<div>
		<div className="line-clamp-2 font-medium">
			{product.title ?? "Loading Amazon listing data…"}
		</div>
		<div className="mt-1 flex items-center gap-2 text-muted-foreground">
			<span className="font-mono">{product.asin}</span>
			{product.brand ? (
				<>
					<span>·</span>
					<span>{product.brand}</span>
				</>
			) : null}
		</div>
	</div>
);

const ProductSummary = ({
	product,
}: {
	product: NonNullable<CatalogResult["currentProduct"]>;
}) => (
	<>
		<div className="line-clamp-2 font-medium">
			{product.title ?? "Untitled Product"}
		</div>
		<div className="mt-1 flex items-center gap-2 text-muted-foreground">
			<span className="font-mono">{product.asin}</span>
			<span>·</span>
			<span>{product.brand ?? "No brand"}</span>
			<MerchListingBadge
				className="rounded-sm px-1 py-0 text-[9px]"
				value={product.isMerchListing}
			/>
		</div>
	</>
);

const PositionCell = ({ value }: { value: number }) => (
	<TableCell className="text-right font-mono font-semibold">{value}</TableCell>
);

const MetricCell = ({
	value,
	prefix = "",
}: {
	value: number | null;
	prefix?: string;
}) => (
	<TableCell className="text-right font-mono">
		{value === null ? "--" : `${prefix}${formatNumber(value)}`}
	</TableCell>
);

const PriceCell = ({
	amountMinor,
	currencyCode,
}: {
	amountMinor: number | null;
	currencyCode: string;
}) => (
	<TableCell className="text-right font-mono">
		{formatPrice(amountMinor, currencyCode)}
	</TableCell>
);

const formatPrice = (amountMinor: number | null, currencyCode: string) => {
	if (amountMinor === null) {
		return "--";
	}
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currencyCode,
	}).format(amountMinor / 100);
};
