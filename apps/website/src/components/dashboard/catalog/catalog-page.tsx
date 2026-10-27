import { SyncControl } from "./sync-control";
import { KeywordDirectoryFilter } from "./keyword-directory-filter";
import { DashboardTable } from "@/components/dashboard/dashboard-table";
import { useDeferredValue, useMemo, useState } from "react";
import { SearchBar } from "@/components/dashboard/search-bar";
import { KeywordStatusBadge } from "./keyword-status-badge";
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
import { useKeywordDirectoryDueRefresh } from "./use-keyword-directory-due-refresh";
import { useKeywordTrack } from "./use-keyword-track";
import { uniqueKeywordRows } from "./keyword-directory-cache";

const states = ["all", "queued", "scanning", "upToDate", "untracked"] as const;
const statusLabels: Record<string, string> = {
	all: "Tracked keywords",
	queued: "Queued",
	scanning: "Scanning",
	upToDate: "Up to date",
	untracked: "Untracked",
};
const reasonLabels: Record<string, string> = {
	notRelevant: "Not relevant",
	noMerchFound: "No Merch found",
	notScheduled: "Not scheduled",
};
const columns = [
	{ key: "keyword", width: undefined },
	{ key: "source", width: 116 },
	{ key: "status", width: 212 },
	{ key: "products", width: 144 },
	{ key: "popularity", width: 112 },
	{ key: "lastChecked", width: 144 },
	{ key: "nextCheck", width: 180 },
];
const heats = ["all", "hot", "warm", "cold", "unrated"] as const;
const sourceLabels: Record<string, string> = {
	interest: "User search",
	adsRecommendation: "ASIN",
	autocomplete: "Autocomplete",
	legacy: "Imported",
};
export const CatalogPage = () => {
	const [search, setSearch] = useState("");
	const [state, setState] = useState<(typeof states)[number]>("all");
	const [heat, setHeat] = useState<(typeof heats)[number]>("all");
	const track = useKeywordTrack();
	const deferredSearch = useDeferredValue(search.trim());
	const input = useMemo(
		() => ({ search: deferredSearch || undefined, state, heat, limit: 50 }),
		[deferredSearch, state, heat],
	);
	useKeywordDirectoryChanged(input);
	const query = useKeywordDirectory(input);
	const items = uniqueKeywordRows(query.data?.pages ?? []);
	useKeywordDirectoryDueRefresh(input, items);
	return (
		<div className="flex h-full min-h-0 bg-background">
			<aside className="w-48 shrink-0 overflow-y-auto border-r border-border bg-card text-xs">
				<KeywordDirectoryFilter
					title="Status"
					values={states}
					labels={statusLabels}
					selected={state}
					onSelect={setState}
				/>
				<KeywordDirectoryFilter
					title="Popularity"
					values={heats}
					selected={heat}
					onSelect={setHeat}
				/>
			</aside>
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
										setState("all");
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
						tableClassName="min-w-[1100px]"
						header={
							<TableHeader className="sticky top-0 z-10 bg-card">
								<TableRow className="hover:bg-transparent">
									{[
										"Keyword",
										"Source",
										"Status",
										"Merch / products",
										"Popularity",
										"Last checked",
										"Refresh / next check",
									].map((label) => (
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
										colSpan={7}
										className="h-24 text-center text-muted-foreground"
									>
										Loading keywords…
									</TableCell>
								</TableRow>
							) : null}
							{query.error ? (
								<TableRow>
									<TableCell
										colSpan={7}
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
										colSpan={7}
										className="h-24 text-center text-muted-foreground"
									>
										No matching keywords.
									</TableCell>
								</TableRow>
							) : null}
							{items.map((item) => (
								<TableRow key={item.id} className="h-10">
									<TableCell className="truncate font-medium" title={item.term}>
										{item.term}
									</TableCell>
									<TableCell
										className="truncate text-muted-foreground"
										title={
											item.sources
												.map((source) => sourceLabels[source] ?? source)
												.join(", ") || "Imported"
										}
									>
										{item.sources
											.map((source) => sourceLabels[source] ?? source)
											.join(", ") || "Imported"}
									</TableCell>
									<TableCell>
										<div className="flex min-w-0 items-center gap-2">
											<KeywordStatusBadge
												status={item.status}
												reason={
													item.untrackedReason
														? reasonLabels[item.untrackedReason]
														: item.retryScheduled
															? "Retry scheduled"
															: undefined
												}
											/>
											{item.untrackedReason || item.retryScheduled ? (
												<span
													className="truncate text-xs text-muted-foreground"
													title={
														item.untrackedReason
															? reasonLabels[item.untrackedReason]
															: "Retry scheduled"
													}
												>
													{item.untrackedReason
														? reasonLabels[item.untrackedReason]
														: "Retry scheduled"}
												</span>
											) : null}
										</div>
									</TableCell>
									<TableCell className="font-mono tabular-nums">
										{item.merch} / {item.products}
									</TableCell>
									<TableCell>
										{item.heat}
										{item.score === null ? "" : ` · ${Math.round(item.score)}`}
									</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground">
										{date(item.lastCheckedAt)}
									</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground">
										{item.intervalDays === null
											? "—"
											: `~${Math.round(item.intervalDays)}d`}{" "}
										· {date(item.nextCheckAt)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</DashboardTable>
				</div>
				<footer className="border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">
					{items.length.toLocaleString()}{" "}
					{items.length === 1 ? "keyword" : "keywords"} loaded
				</footer>
			</main>
		</div>
	);
};

const date = (value: string | null) =>
	value
		? new Date(value).toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			})
		: "—";
