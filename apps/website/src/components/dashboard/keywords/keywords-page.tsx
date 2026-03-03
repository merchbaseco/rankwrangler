import {
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { RefreshCw, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createColumns } from "@/components/dashboard/keywords/columns";
import { KeywordsTableView } from "@/components/dashboard/keywords/table-view";
import type { SearchTermRow } from "@/components/dashboard/keywords/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/trpc";
import { cn, formatNumber } from "@/lib/utils";

export const KeywordsPage = () => {
	const defaults = useMemo(() => getDefaultPreviousMonthDateWindow(), []);
	const loadMoreRef = useRef<HTMLDivElement>(null);
	const [searchValue, setSearchValue] = useState("");
	const [minRankValue, setMinRankValue] = useState("");
	const [maxRankValue, setMaxRankValue] = useState("");
	const [sorting, setSorting] = useState<SortingState>([
		{ desc: false, id: "searchFrequencyRank" },
	]);
	const deferredSearch = useDeferredValue(searchValue.trim());
	const baseInput = useMemo(
		() => ({
			dataEndDate: defaults.dataEndDate,
			dataStartDate: defaults.dataStartDate,
			marketplaceId: "ATVPDKIKX0DER",
			reportPeriod: "MONTH" as const,
		}),
		[defaults],
	);

	const queryInput = useMemo(
		() => ({
			...baseInput,
			limit: 100,
			maxRank: parseOptionalInteger(maxRankValue),
			minRank: parseOptionalInteger(minRankValue),
			search: deferredSearch.length > 0 ? deferredSearch : undefined,
		}),
		[baseInput, deferredSearch, maxRankValue, minRankValue],
	);

	const statusQuery = api.api.app.searchTermsStatus.useQuery(baseInput, {
		refetchInterval: 4000,
		refetchOnWindowFocus: true,
	});
	const isFetchInProgress =
		statusQuery.data?.status.status === "queued" ||
		statusQuery.data?.status.status === "in_progress";
	const query = api.api.app.searchTermsList.useInfiniteQuery(queryInput, {
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		refetchInterval: isFetchInProgress ? 4000 : false,
		refetchOnWindowFocus: false,
	});
	const refreshMutation = api.api.app.searchTermsRefresh.useMutation({
		onSuccess: () => {
			void statusQuery.refetch();
			void query.refetch();
		},
	});

	const rows = useMemo<SearchTermRow[]>(
		() => query.data?.pages.flatMap((page) => page.items) ?? [],
		[query.data],
	);
	const summary = query.data?.pages[0]?.summary ?? null;
	const fetchStatus = statusQuery.data?.status ?? summary?.status ?? null;
	const columns = useMemo(() => createColumns(), []);
	const colgroupColumns = useMemo(
		() =>
			columns.map((column, index) => {
				const meta = column.meta as { flex?: boolean } | undefined;
				const key =
					(typeof column.id === "string" && column.id) ||
					(typeof column.accessorKey === "string" && column.accessorKey) ||
					`column-${index}`;
				return { key, width: meta?.flex ? undefined : column.size };
			}),
		[columns],
	);

	useEffect(() => {
		if (!query.hasNextPage || query.isFetchingNextPage) {
			return;
		}

		const node = loadMoreRef.current;
		if (!node) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const [entry] = entries;
				if (
					!entry?.isIntersecting ||
					!query.hasNextPage ||
					query.isFetchingNextPage
				) {
					return;
				}
				void query.fetchNextPage();
			},
			{ rootMargin: "240px 0px" },
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);

	const table = useReactTable({
		columns,
		data: rows,
		enableSortingRemoval: false,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onSortingChange: setSorting,
		state: { sorting },
	});

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
			<div className="flex h-9 shrink-0 items-center border-b border-border text-xs">
				<div className="relative flex h-full items-center border-r border-border">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={searchValue}
						onChange={(event) => setSearchValue(event.target.value)}
						placeholder="Search terms..."
						className="h-full w-56 rounded-none border-0 bg-transparent pl-9 text-xs shadow-none focus-within:ring-0"
					/>
				</div>

				<div className="flex h-full items-center border-r border-border">
					<Input
						value={minRankValue}
						onChange={(event) => setMinRankValue(event.target.value)}
						placeholder="Min rank"
						className="h-full w-24 rounded-none border-0 bg-transparent text-center text-xs shadow-none focus-within:ring-0"
					/>
					<span className="text-muted-foreground">–</span>
					<Input
						value={maxRankValue}
						onChange={(event) => setMaxRankValue(event.target.value)}
						placeholder="Max rank"
						className="h-full w-24 rounded-none border-0 bg-transparent text-center text-xs shadow-none focus-within:ring-0"
					/>
				</div>

				<div className="flex flex-1 items-center gap-3 px-3 font-mono text-muted-foreground">
					<span>
						{summary?.dataStartDate ?? defaults.dataStartDate} –{" "}
						{summary?.dataEndDate ?? defaults.dataEndDate}
					</span>
					<span className="text-border">|</span>
					<span>
						{summary ? formatNumber(summary.totalFiltered) : "--"}{" "}
						terms
					</span>
					<span className="text-border">|</span>
					<span>{formatNumber(rows.length)} loaded</span>
					{fetchStatus?.lastError ? (
						<>
							<span className="text-border">|</span>
							<span className="text-destructive">
								{fetchStatus.lastError}
							</span>
						</>
					) : null}
				</div>

				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="h-full rounded-none border-l border-border px-3 text-xs uppercase tracking-wide"
					onClick={() => refreshMutation.mutate(baseInput)}
					disabled={refreshMutation.isPending || isFetchInProgress}
				>
					<RefreshCw
						className={cn(
							"mr-1 size-3",
							(refreshMutation.isPending || isFetchInProgress) &&
								"animate-spin",
						)}
					/>
					Refresh
				</Button>
			</div>

			<div className="min-h-0 flex-1">
				<KeywordsTableView
					table={table}
					colgroupColumns={colgroupColumns}
					columnsCount={columns.length}
					hasNextPage={Boolean(query.hasNextPage)}
					isFetchingNextPage={query.isFetchingNextPage}
					isLoading={query.isLoading}
					hasError={Boolean(query.error)}
					loadMoreRef={loadMoreRef}
				/>
			</div>
		</div>
	);
};

const parseOptionalInteger = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	const numeric = Number(trimmed);
	if (!Number.isFinite(numeric) || numeric < 1) {
		return undefined;
	}

	return Math.floor(numeric);
};

const getDefaultPreviousMonthDateWindow = () => {
	const now = new Date();
	const monthStart = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
	);
	const previousMonthEnd = new Date(monthStart.getTime() - 24 * 60 * 60 * 1000);
	const previousMonthStart = new Date(
		Date.UTC(
			previousMonthEnd.getUTCFullYear(),
			previousMonthEnd.getUTCMonth(),
			1,
		),
	);

	return {
		dataEndDate: previousMonthEnd.toISOString().slice(0, 10),
		dataStartDate: previousMonthStart.toISOString().slice(0, 10),
	};
};
