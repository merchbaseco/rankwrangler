import { SyncControl } from "./sync-control";
import { DashboardTable } from "@/components/dashboard/dashboard-table";
import { useDeferredValue, useMemo, useState } from "react";
import { SearchBar } from "@/components/dashboard/search-bar";
import { Button } from "@/components/ui/button";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useKeywordDirectory } from "./use-keyword-directory";
import { useKeywordDirectoryChanged } from "./use-keyword-directory-changed";
import { useKeywordDirectoryCounts } from "./use-keyword-directory-counts";
import { useKeywordDirectoryDueRefresh } from "./use-keyword-directory-due-refresh";
import { useKeywordTrack } from "./use-keyword-track";
import { uniqueKeywordRows } from "./keyword-directory-cache";
import { KeywordDirectoryRow } from "./keyword-directory-row";
import {
	KeywordDirectorySidebar,
	type Freshness,
	type Heat,
	type Stage,
} from "./keyword-directory-sidebar";

const columns = [
	{ key: "keyword", width: undefined },
	{ key: "source", width: 116 },
	{ key: "stage", width: 236 },
	{ key: "freshness", width: 196 },
	{ key: "products", width: 128 },
	{ key: "popularity", width: 168 },
	{ key: "lastChecked", width: 136 },
	{ key: "nextCheck", width: 172 },
];
const headings = [
	"Keyword",
	"Source",
	"Stage",
	"Freshness",
	"Merch / products",
	"Popularity",
	"Last checked",
	"Refresh / next check",
];
export const CatalogPage = () => {
	const [search, setSearch] = useState("");
	const [stage, setStage] = useState<Stage>("graduated");
	const [freshness, setFreshness] = useState<Freshness>("all");
	const [heat, setHeat] = useState<Heat>("all");
	const track = useKeywordTrack();
	const deferredSearch = useDeferredValue(search.trim());
	const filters = useMemo(
		() => ({ search: deferredSearch || undefined, heat }),
		[deferredSearch, heat],
	);
	const input = useMemo(
		() => ({ ...filters, stage, freshness, limit: 50 }),
		[filters, stage, freshness],
	);
	useKeywordDirectoryChanged(input);
	const query = useKeywordDirectory(input);
	const counts = useKeywordDirectoryCounts(filters).data;
	const items = uniqueKeywordRows(query.data?.pages ?? []);
	useKeywordDirectoryDueRefresh(input, items);
	return (
		<div className="flex h-full min-h-0 bg-background">
			<KeywordDirectorySidebar
				stage={stage}
				freshness={freshness}
				heat={heat}
				counts={counts}
				onStage={(next) => {
					setStage(next);
					setFreshness("all");
				}}
				onFreshness={setFreshness}
				onHeat={setHeat}
			/>
			<main className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<SearchBar
					inputAriaLabel="Filter keywords"
					placeholder="Search keywords..."
					searchValue={search}
					onSearchValueChange={setSearch}
					onSubmit={() => {
						if (search.trim())
							track.mutate(
								{ term: search.trim() },
								{
									onSuccess: () => {
										setStage("graduated");
										setFreshness("all");
										setHeat("all");
									},
								},
							);
					}}
				>
					<SyncControl />
					<Button
						size="sm"
						variant="ghost"
						type="submit"
						disabled={!search.trim() || track.isPending}
						className="mr-2"
					>
						{track.isPending ? "Adding…" : "Track keyword"}
					</Button>
				</SearchBar>
				{track.error ? (
					<p className="px-3 py-2 text-xs text-destructive">
						Couldn’t track keyword: {track.error.message}
					</p>
				) : null}
				<div className="min-h-0 flex-1">
					<DashboardTable
						afterTable={
							query.hasNextPage ? (
								<div className="p-3 text-center">
									<Button
										size="sm"
										variant="outline"
										disabled={query.isFetchingNextPage}
										onClick={() => void query.fetchNextPage()}
									>
										{query.isFetchingNextPage ? "Loading…" : "Load more"}
									</Button>
								</div>
							) : null
						}
						colgroupColumns={columns}
						tableClassName="min-w-[1260px]"
						header={
							<TableHeader className="sticky top-0 z-10 bg-card">
								<TableRow className="hover:bg-transparent">
									{headings.map((label) => (
										<TableHead key={label} className="whitespace-nowrap">
											{label}
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
						}
					>
						<TableBody>
							{query.isLoading ? (
								<TableRow>
									<TableCell
										colSpan={headings.length}
										className="h-24 text-center text-muted-foreground"
									>
										Loading keywords…
									</TableCell>
								</TableRow>
							) : null}
							{query.error ? (
								<TableRow>
									<TableCell
										colSpan={headings.length}
										className="h-24 text-center text-destructive"
									>
										Couldn’t load keywords.{" "}
										<Button
											variant="ghost"
											size="sm"
											onClick={() => void query.refetch()}
										>
											Retry
										</Button>
									</TableCell>
								</TableRow>
							) : null}
							{!query.isLoading && !query.error && items.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={headings.length}
										className="h-24 text-center text-muted-foreground"
									>
										No matching keywords.
									</TableCell>
								</TableRow>
							) : null}
							{items.map((item) => (
								<KeywordDirectoryRow key={item.id} item={item} />
							))}
						</TableBody>
					</DashboardTable>
				</div>
				<footer className="border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">
					{items.length.toLocaleString()}{" "}
					{items.length === 1 ? "keyword" : "keywords"} loaded
					{counts?.trial
						? ` · ${counts.trial.toLocaleString()} ${counts.trial === 1 ? "trial" : "trials"} waiting`
						: null}
				</footer>
			</main>
		</div>
	);
};
