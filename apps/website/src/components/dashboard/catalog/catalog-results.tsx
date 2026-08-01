import { Database, History } from "lucide-react";
import type { CatalogRun } from "./types";
import { Badge } from "@/components/ui/badge";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatNumber, formatRelativeTime } from "@/lib/utils";

export const CatalogResults = ({
	run,
	isLatestRun,
}: {
	run: CatalogRun;
	isLatestRun: boolean;
}) => (
	<div className="flex min-h-0 flex-1 flex-col bg-card">
		<div className="shrink-0 border-b border-border px-5 py-3">
			<div className="flex items-center justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						{isLatestRun ? (
							<Database className="size-4 text-muted-foreground" />
						) : (
							<History className="size-4 text-muted-foreground" />
						)}
						<h2 className="text-sm font-semibold">
							{isLatestRun ? "Current results" : "Historical run"}
						</h2>
						<Badge className="rounded-sm" variant="outline">
							Keepa · US
						</Badge>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						Source positions and Observed columns are immutable from{" "}
						{new Date(run.sourceCompletedAt).toLocaleString()}. Product and
						Current columns reflect today&apos;s canonical Product state.
					</p>
				</div>
				<span className="shrink-0 font-mono text-xs text-muted-foreground">
					{run.resultCount} results
				</span>
			</div>
		</div>

		<div className="min-h-0 flex-1 overflow-auto">
			<table className="w-full min-w-[1120px] text-xs">
				<TableHeader className="sticky top-0 z-10 bg-card">
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-20 text-right">Keepa pos.</TableHead>
						<TableHead className="w-14" />
						<TableHead>Canonical Product</TableHead>
						<TableHead className="text-right">Observed BSR</TableHead>
						<TableHead className="text-right">Current BSR</TableHead>
						<TableHead className="text-right">Observed price</TableHead>
						<TableHead className="text-right">Current price</TableHead>
						<TableHead className="text-right">Observed sold</TableHead>
						<TableHead>Source / freshness</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{run.results.map((result) => {
						const product = result.currentProduct;
						const current = product?.keepa;
						return (
							<TableRow key={`${run.id}:${result.productId}`}>
								<TableCell className="text-right font-mono font-semibold">
									{result.position.value}
								</TableCell>
								<TableCell>
									<ProductThumbnail
										asin={product?.asin ?? result.productId}
										title={product?.title ?? null}
										url={product?.thumbnailUrl ?? null}
									/>
								</TableCell>
								<TableCell className="max-w-80 whitespace-normal">
									{product ? (
										<>
											<div className="line-clamp-2 font-medium">
												{product.title ?? "Untitled Product"}
											</div>
											<div className="mt-1 flex items-center gap-2 text-muted-foreground">
												<span className="font-mono">{product.asin}</span>
												<span>·</span>
												<span>{product.brand ?? "No brand"}</span>
												{product.isMerchListing ? (
													<Badge
														className="rounded-sm px-1 py-0 text-[9px]"
														variant="secondary"
													>
														Merch
													</Badge>
												) : null}
											</div>
										</>
									) : (
										<div>
											<span className="text-muted-foreground">
												Canonical Product unavailable
											</span>
											<div className="mt-1 font-mono text-[11px]">
												{result.productId}
											</div>
										</div>
									)}
								</TableCell>
								<MetricCell value={result.observed.rootCategoryBsr} prefix="#" />
								<MetricCell value={current?.currentRootCategoryBsr ?? null} prefix="#" />
								<TableCell className="text-right font-mono">
									{formatPrice(
										result.observed.newPriceAmountMinor,
										result.observed.currencyCode,
									)}
								</TableCell>
								<TableCell className="text-right font-mono">
									{formatPrice(
										current?.currentNewPrice?.amountMinor ?? null,
										current?.currentNewPrice?.currencyCode ?? "USD",
									)}
								</TableCell>
								<MetricCell value={result.observed.monthlySold} />
								<TableCell className="whitespace-normal">
									<div className="font-medium">Keepa observation</div>
									<div className="mt-1 text-[11px] text-muted-foreground">
										Observed{" "}
										{formatRelativeTime(result.observed.sourceUpdatedAt)}
										{current?.fetchedAt
											? ` · Product refreshed ${formatRelativeTime(current.fetchedAt)}`
											: ""}
									</div>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</table>
		</div>
	</div>
);

const ProductThumbnail = ({
	url,
	title,
	asin,
}: {
	url: string | null;
	title: string | null;
	asin: string;
}) =>
	url ? (
		<div className="flex h-12 w-10 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted">
			<img
				alt={title ?? asin}
				className="h-full w-auto max-w-none"
				src={url}
			/>
		</div>
	) : (
		<div className="flex h-12 w-10 items-center justify-center rounded-sm border border-border bg-muted text-[9px] text-muted-foreground">
			N/A
		</div>
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

const formatPrice = (amountMinor: number | null, currencyCode: string) => {
	if (amountMinor === null) {
		return "--";
	}
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currencyCode,
	}).format(amountMinor / 100);
};
