import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import {
	AvailableCatalogProductThumbnail,
	PendingCatalogProductThumbnail,
	UnavailableCatalogProductThumbnail,
} from "./catalog-product-thumbnail";
import type { CatalogResult } from "./types";
import { useCatalogProductQuery } from "./use-catalog-product-query";

export const CatalogProductRow = ({
	result,
	runId,
}: {
	result: CatalogResult;
	runId: string;
}) => {
	const initialProduct = result.currentProduct;
	if (!initialProduct) {
		return <UnavailableCatalogProductRow result={result} runId={runId} />;
	}

	return (
		<ResolvedCatalogProductRow
			initialProduct={initialProduct}
			result={result}
			runId={runId}
		/>
	);
};

const ResolvedCatalogProductRow = ({
	initialProduct,
	result,
	runId,
}: {
	initialProduct: NonNullable<CatalogResult["currentProduct"]>;
	result: CatalogResult;
	runId: string;
}) => {
	const productQuery = useCatalogProductQuery({
		initialProduct,
		initialSyncPending: result.currentProductSyncPending,
	});
	const product = productQuery.data?.product ?? initialProduct;
	const current = product.keepa;
	const isSpApiPending =
		product.metadata.spApiFetchedAt === null &&
		(productQuery.data?.syncPending ?? result.currentProductSyncPending);

	return (
		<TableRow key={`${runId}:${result.productId}`}>
			<PositionCell value={result.position.value} />
			<TableCell>
				{isSpApiPending ? (
					<PendingCatalogProductThumbnail />
				) : product.thumbnailUrl ? (
					<AvailableCatalogProductThumbnail
						asin={product.asin}
						title={product.title}
						url={product.thumbnailUrl}
					/>
				) : (
					<UnavailableCatalogProductThumbnail />
				)}
			</TableCell>
			<TableCell className="max-w-80 whitespace-normal">
				{isSpApiPending ? (
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
			<SourceFreshnessCell
				currentFetchedAt={current?.fetchedAt ?? null}
				observedAt={result.observed.sourceUpdatedAt}
			/>
		</TableRow>
	);
};

const UnavailableCatalogProductRow = ({
	result,
	runId,
}: {
	result: CatalogResult;
	runId: string;
}) => (
	<TableRow key={`${runId}:${result.productId}`}>
		<PositionCell value={result.position.value} />
		<TableCell>
			<UnavailableCatalogProductThumbnail />
		</TableCell>
		<TableCell className="max-w-80 whitespace-normal">
			<div>
				<span className="text-muted-foreground">
					Canonical Product unavailable
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
		<SourceFreshnessCell
			currentFetchedAt={null}
			observedAt={result.observed.sourceUpdatedAt}
		/>
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
			{product.isMerchListing ? (
				<Badge className="rounded-sm px-1 py-0 text-[9px]" variant="secondary">
					Merch
				</Badge>
			) : null}
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

const SourceFreshnessCell = ({
	currentFetchedAt,
	observedAt,
}: {
	currentFetchedAt: string | null;
	observedAt: string | null;
}) => (
	<TableCell className="whitespace-normal">
		<div className="font-medium">Keepa observation</div>
		<div className="mt-1 text-[11px] text-muted-foreground">
			Observed {formatRelativeTime(observedAt)}
			{currentFetchedAt
				? ` · Product refreshed ${formatRelativeTime(currentFetchedAt)}`
				: ""}
		</div>
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
