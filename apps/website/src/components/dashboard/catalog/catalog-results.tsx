import { Database, History } from "lucide-react";
import {
	ProductImageTooltip,
	useProductImageTooltip,
} from "@/components/dashboard/product-image-tooltip";
import { CatalogProductRow } from "./catalog-product-row";
import type { CatalogRun } from "./types";
import {
	DashboardTable,
	type DashboardTableColumn,
} from "@/components/dashboard/dashboard-table";
import { Badge } from "@/components/ui/badge";
import {
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export const CatalogResults = ({
	run,
	isLatestRun,
}: {
	run: CatalogRun;
	isLatestRun: boolean;
}) => {
	const {
		onRowMouseEnter,
		onRowMouseLeave,
		onRowMouseMove,
		tooltip,
		tooltipRef,
	} = useProductImageTooltip();

	return (
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
							<Badge className="rounded-sm" variant="outline">
								{run.trigger === "automatic"
									? "Automatic refresh"
									: "Requested search"}
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

			<DashboardTable
				colgroupColumns={CATALOG_TABLE_COLUMNS}
				header={
					<TableHeader className="sticky top-0 z-10 bg-card">
						<TableRow className="hover:bg-transparent">
							<TableHead className="text-right">Keepa pos.</TableHead>
							<TableHead />
							<TableHead>Canonical Product</TableHead>
							<TableHead className="text-right">Observed BSR</TableHead>
							<TableHead className="text-right">Current BSR</TableHead>
							<TableHead className="text-right">Observed price</TableHead>
							<TableHead className="text-right">Current price</TableHead>
							<TableHead className="text-right">Observed sold</TableHead>
						</TableRow>
					</TableHeader>
				}
				tableClassName="min-w-[1120px]"
			>
				<TableBody>
					{run.results.map((result) => (
						<CatalogProductRow
							key={`${run.id}:${result.productId}`}
							onRowMouseEnter={onRowMouseEnter}
							onRowMouseLeave={onRowMouseLeave}
							onRowMouseMove={onRowMouseMove}
							result={result}
							runId={run.id}
						/>
					))}
				</TableBody>
			</DashboardTable>
			<ProductImageTooltip tooltip={tooltip} tooltipRef={tooltipRef} />
		</div>
	);
};

const CATALOG_TABLE_COLUMNS: DashboardTableColumn[] = [
	{ key: "position", width: 80 },
	{ key: "thumbnail", width: 56 },
	{ key: "product", width: 320 },
	{ key: "observed-bsr", width: 100 },
	{ key: "current-bsr", width: 100 },
	{ key: "observed-price", width: 110 },
	{ key: "current-price", width: 110 },
	{ key: "observed-sold", width: 100 },
];
