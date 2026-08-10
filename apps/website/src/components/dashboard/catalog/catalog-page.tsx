import { Search, Sparkles } from "lucide-react";
import { type FormEvent, useMemo } from "react";
import { CatalogResults } from "./catalog-results";
import { CatalogRunSidebar } from "./catalog-run-sidebar";
import {
	type CatalogDisplayStatus,
	CatalogStatusPanel,
} from "./catalog-status-panel";
import { useCatalogSearchExplorer } from "./use-catalog-search-explorer";
import { useProductSyncInvalidation } from "./use-product-sync-invalidation";
import { useSeedCatalogProductQueries } from "./use-seed-catalog-product-queries";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/dashboard/search-bar";

export const CatalogPage = () => {
	const explorer = useCatalogSearchExplorer();
	useSeedCatalogProductQueries(explorer.selectedRun);
	const pendingProducts = useMemo(
		() =>
			explorer.selectedRun?.results.flatMap((result) => {
				const product = result.currentProduct;
				if (
					!product ||
					result.currentAmazonListingStatus !== "pending"
				) {
					return [];
				}
				return [
					{
						marketplaceId: product.marketplaceId,
						asin: product.asin,
					},
				];
			}) ?? [],
		[explorer.selectedRun],
	);
	useProductSyncInvalidation({
		marketplaceId: explorer.selectedRun?.query.marketplaceId ?? null,
		pendingProducts,
	});
	const status = useMemo<CatalogDisplayStatus>(() => {
		if (explorer.isSearching) {
			return { kind: "pending" };
		}
		if (explorer.operationError) {
			return { kind: "error", message: explorer.operationError };
		}
		if (!explorer.activeTerm || !explorer.selectedRun) {
			return { kind: "idle" };
		}
		if (explorer.selectedRun.results.length === 0) {
			return {
				kind: "empty",
				observedAt: explorer.selectedRun.sourceCompletedAt,
			};
		}
		return { kind: "ready" };
	}, [
		explorer.activeTerm,
		explorer.isSearching,
		explorer.operationError,
		explorer.selectedRun,
	]);

	const submit = (event: FormEvent) => {
		event.preventDefault();
		void explorer.submitSearch();
	};
	const isLatestRun =
		explorer.selectedRun?.id === explorer.query?.latestRun?.id;

	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<header className="shrink-0 border-b border-border bg-card px-5 py-4">
				<div className="flex items-end justify-between gap-8">
					<div>
						<div className="flex items-center gap-2">
							<Sparkles className="size-4 text-muted-foreground" />
							<h1 className="font-display text-lg font-semibold">
								Keyword research
							</h1>
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							Preserved Keepa search evidence, separate from current Product
							state.
						</p>
					</div>
					<SearchBar
						className="w-full max-w-2xl border-0 bg-transparent"
						disabled={explorer.isSearching}
						inputAriaLabel="Catalog search phrase"
						onSearchValueChange={explorer.setInputTerm}
						onSubmit={submit}
						placeholder="retro gardening shirt"
						searchValue={explorer.inputTerm}
					>
						<Button
							className="rounded-sm"
							disabled={!explorer.inputTerm.trim() || explorer.isSearching}
							type="submit"
						>
							<Search className="size-4" />
							Search
						</Button>
						{explorer.query ? (
							<Button
								className="rounded-sm"
								disabled={explorer.isSearching}
								onClick={() => void explorer.submitSearch(0)}
								type="button"
								variant="outline"
							>
								Fetch fresh
							</Button>
						) : null}
					</SearchBar>
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				<CatalogRunSidebar
					hasNextPage={explorer.hasMoreRuns}
					isFetchingNextPage={explorer.isLoadingMoreRuns}
					onLoadMore={() => void explorer.loadMoreRuns()}
					onSelectRun={explorer.setSelectedRunId}
					runs={explorer.runs}
					selectedRunId={explorer.selectedRunId}
				/>
				<main className="flex min-h-0 min-w-0 flex-1 flex-col">
					<CatalogStatusPanel
						hasPriorEvidence={Boolean(explorer.selectedRun)}
						status={status}
					/>
					{explorer.selectedRun &&
					(status.kind === "ready" ||
						status.kind === "pending" ||
						status.kind === "error") ? (
						<CatalogResults
							isLatestRun={isLatestRun}
							run={explorer.selectedRun}
						/>
					) : null}
				</main>
			</div>
		</div>
	);
};
