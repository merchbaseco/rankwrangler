import { Database, History } from "lucide-react";
import { CatalogProductRow } from "./catalog-product-row";
import type { CatalogRun } from "./types";
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
					{run.results.map((result) => (
						<CatalogProductRow
							key={`${run.id}:${result.productId}`}
							result={result}
							runId={run.id}
						/>
					))}
				</TableBody>
			</table>
		</div>
	</div>
);
