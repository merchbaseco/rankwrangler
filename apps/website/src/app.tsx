import {
	ChevronDown,
	ChevronUp,
	Moon,
	Search,
	Settings,
	Sun,
	UserCircle,
	X,
} from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { RecentProducts, type FilterState } from "@/components/dashboard/recent-products";
import { SearchBar } from "@/components/dashboard/search-bar";
import { SettingsModal } from "@/components/dashboard/settings-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useLicense } from "@/hooks/use-license";
import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/trpc";
import { cn, formatNumber } from "@/lib/utils";

type BsrRange = "top1k" | "top10k" | "top100k" | "100k+";
type LastUpdated = "all" | "24h" | "7d" | "30d";

const BSR_OPTIONS: Array<{ key: BsrRange; label: string }> = [
	{ key: "top1k", label: "Top 1K" },
	{ key: "top10k", label: "Top 10K" },
	{ key: "top100k", label: "Top 100K" },
	{ key: "100k+", label: "100K+" },
];

const MARKETPLACES = [
	{ id: "ATVPDKIKX0DER", label: "US", flag: "🇺🇸" },
	{ id: "A1F83G8C2ARO7P", label: "UK", flag: "🇬🇧" },
	{ id: "A1PA6795UKMFR9", label: "DE", flag: "🇩🇪" },
	{ id: "A13V1IB3VIYZZH", label: "FR", flag: "🇫🇷" },
	{ id: "A1VC38T7YXB528", label: "JP", flag: "🇯🇵" },
] as const;

const LAST_UPDATED_OPTIONS: Array<{ key: LastUpdated; label: string }> = [
	{ key: "all", label: "All time" },
	{ key: "24h", label: "Last 24h" },
	{ key: "7d", label: "Last 7 days" },
	{ key: "30d", label: "Last 30 days" },
];

const FACETS = [
	{ emoji: "🐶", label: "Dogs" },
	{ emoji: "🐱", label: "Cats" },
	{ emoji: "🎾", label: "Tennis" },
	{ emoji: "🏈", label: "Football" },
	{ emoji: "⚽", label: "Soccer" },
	{ emoji: "🎣", label: "Fishing" },
	{ emoji: "🏕️", label: "Camping" },
	{ emoji: "☕", label: "Coffee" },
	{ emoji: "📚", label: "Books" },
	{ emoji: "🎸", label: "Guitar" },
	{ emoji: "🧶", label: "Knitting" },
	{ emoji: "🌱", label: "Gardening" },
	{ emoji: "🐓", label: "Farm Life" },
	{ emoji: "🚀", label: "Space" },
	{ emoji: "💻", label: "Coding" },
	{ emoji: "🎮", label: "Gaming" },
	{ emoji: "🧩", label: "Puzzles" },
	{ emoji: "🏃", label: "Running" },
	{ emoji: "🚴", label: "Cycling" },
	{ emoji: "🌊", label: "Ocean" },
	{ emoji: "🏔️", label: "Mountains" },
	{ emoji: "✈️", label: "Travel" },
	{ emoji: "🍕", label: "Pizza" },
	{ emoji: "🐉", label: "Dragons" },
	{ emoji: "😎", label: "Retro" },
];

export function App() {
	const [filters, setFilters] = useState<FilterState>({
		bsrRanges: [],
		marketplaceIds: [],
		lastUpdated: "all",
	});
	const [, startFilterTransition] = useTransition();
	const [facetSearch, setFacetSearch] = useState("");
	const [activeFacets, setActiveFacets] = useState<string[]>([]);
	const [nichesSectionOpen, setNichesSectionOpen] = useState(true);
	const [productStatus, setProductStatus] = useState<{ count: number; hasMore: boolean }>({
		count: 0,
		hasMore: false,
	});
	const [settingsOpen, setSettingsOpen] = useState(false);
	const { isAdmin } = useAdminAccess();
	const { license } = useLicense();
	const { theme, setTheme } = useTheme();
	const { data: keepaStatus } = api.api.app.getKeepaStatus.useQuery(undefined, {
		refetchInterval: 30000,
		refetchOnWindowFocus: false,
	});

	const handleProductStatusChange = useCallback(
		(info: { count: number; hasMore: boolean }) => {
			setProductStatus(info);
		},
		[],
	);

	const toggleBsrRange = useCallback(
		(range: BsrRange) => {
			startFilterTransition(() => {
				setFilters((prev) => ({
					...prev,
					bsrRanges: prev.bsrRanges.includes(range)
						? prev.bsrRanges.filter((r) => r !== range)
						: [...prev.bsrRanges, range],
				}));
			});
		},
		[startFilterTransition],
	);

	const toggleMarketplace = useCallback(
		(marketplaceId: string) => {
			startFilterTransition(() => {
				setFilters((prev) => ({
					...prev,
					marketplaceIds: prev.marketplaceIds.includes(marketplaceId)
						? prev.marketplaceIds.filter((id) => id !== marketplaceId)
						: [...prev.marketplaceIds, marketplaceId],
				}));
			});
		},
		[startFilterTransition],
	);

	const updateLastUpdated = useCallback(
		(nextLastUpdated: LastUpdated) => {
			startFilterTransition(() => {
				setFilters((prev) => ({ ...prev, lastUpdated: nextLastUpdated }));
			});
		},
		[startFilterTransition],
	);

	const activeFilterCount = useMemo(() => {
		let count = 0;
		if (filters.bsrRanges.length > 0) count += 1;
		if (filters.marketplaceIds.length > 0) count += 1;
		if (filters.lastUpdated !== "all") count += 1;
		return count;
	}, [filters.bsrRanges.length, filters.lastUpdated, filters.marketplaceIds.length]);

	const filteredFacets = useMemo(() => {
		if (!facetSearch.trim()) {
			return FACETS;
		}
		const query = facetSearch.toLowerCase();
		return FACETS.filter((facet) => facet.label.toLowerCase().includes(query));
	}, [facetSearch]);

	const toggleFacet = (facetLabel: string) => {
		setActiveFacets((current) =>
			current.includes(facetLabel)
				? current.filter((facet) => facet !== facetLabel)
				: [...current, facetLabel],
		);
	};

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-background">
			<div className="shrink-0 border-b border-border bg-card px-4 py-2">
				<div className="text-muted-foreground flex items-center gap-4 text-xs font-mono">
					<span className="flex items-center gap-2">
						<img src="/cowboy-hat.png" alt="" className="size-6" />
						<span className="text-sm font-bold tracking-wide text-amber-800">
							RANKWRANGLER
						</span>
					</span>
					<span className="text-border">|</span>
					<span className="flex items-center gap-1.5">
						<span className="relative flex size-2.5">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
							<span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
						</span>
						<span className="font-medium text-emerald-600">CONNECTED</span>
					</span>

					<div className="ml-auto flex items-center gap-4">
						<span>
							API Usage:{" "}
							<span className="font-medium text-foreground">
								{license
									? license.usageLimit === -1
										? `${formatNumber(license.usageToday)} / Unlimited`
										: `${formatNumber(license.usageToday)} / ${formatNumber(license.usageLimit)}`
									: "--"}
							</span>
						</span>
						<span className="text-border">|</span>
						<span>
							Products:{" "}
							<span className="font-medium text-foreground">
								{license ? formatNumber(license.usageCount) : "--"}
							</span>
						</span>
						<span className="text-border">|</span>
						<span>
							Keepa Credits:{" "}
							<span className={cn(
								"font-medium",
								typeof keepaStatus?.tokens.tokensLeft === "number" && keepaStatus.tokens.tokensLeft < 100
									? "text-amber-600"
									: "text-foreground",
							)}>
								{typeof keepaStatus?.tokens.tokensLeft === "number"
									? formatNumber(keepaStatus.tokens.tokensLeft)
									: "--"}
							</span>
						</span>
						<span className="text-border">|</span>
						<span>
							Keepa OK (1h):{" "}
							<span className="font-medium text-emerald-600">
								{formatNumber(keepaStatus?.queue.fetchesLastHourSuccess ?? 0)}
							</span>
						</span>
						<span className="text-border">|</span>
						<span>
							Keepa Err (1h):{" "}
							<span className={cn(
								"font-medium",
								(keepaStatus?.queue.fetchesLastHourError ?? 0) > 0
									? "text-red-600"
									: "text-foreground",
							)}>
								{formatNumber(keepaStatus?.queue.fetchesLastHourError ?? 0)}
							</span>
						</span>
					</div>
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground hover:text-foreground"
							onClick={(e) => setTheme(theme === "dark" ? "light" : "dark", e)}
						>
							{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground hover:text-foreground"
							onClick={() => setSettingsOpen(true)}
						>
							<Settings className="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground hover:text-foreground"
							onClick={() => setSettingsOpen(true)}
						>
							<UserCircle className="size-4" />
						</Button>
					</div>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<aside className="flex h-full w-[230px] shrink-0 flex-col border-r border-border bg-sidebar">
					{/* Compact filter sections — fixed at top */}
					<div className="shrink-0 px-1">
						<FilterSection title="BSR Range" defaultOpen={false}>
							<div className="flex flex-col gap-0.5">
								{BSR_OPTIONS.map((option) => {
									const isActive = filters.bsrRanges.includes(option.key);
									return (
										<button
											key={option.key}
											type="button"
											onClick={() => toggleBsrRange(option.key)}
											className={cn(
												"flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors",
												isActive
													? "bg-primary text-primary-foreground"
													: "text-foreground/80 hover:bg-accent",
											)}
										>
											<span
												className={cn(
													"flex size-3.5 items-center justify-center rounded-sm border text-xs",
													isActive
														? "border-primary-foreground bg-primary-foreground text-primary"
														: "border-input",
												)}
											>
												{isActive ? "✓" : null}
											</span>
											<span>{option.label}</span>
										</button>
									);
								})}
							</div>
						</FilterSection>

						<FilterSection title="Last Updated" defaultOpen={false}>
							<div className="flex flex-col gap-0.5">
								{LAST_UPDATED_OPTIONS.map((option) => {
									const isActive = filters.lastUpdated === option.key;
									return (
										<button
											key={option.key}
											type="button"
											onClick={() => updateLastUpdated(option.key)}
											className={cn(
												"flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors",
												isActive
													? "bg-primary text-primary-foreground"
													: "text-foreground/80 hover:bg-accent",
											)}
										>
											<span
												className={cn(
													"flex size-3.5 items-center justify-center rounded-full border",
													isActive
														? "border-primary-foreground"
														: "border-input",
												)}
											>
												{isActive ? (
													<span className="size-2 rounded-full bg-primary-foreground" />
												) : null}
											</span>
											<span>{option.label}</span>
										</button>
									);
								})}
							</div>
						</FilterSection>

						<FilterSection title="Marketplace" defaultOpen>
							<div className="flex flex-wrap gap-1 px-1">
								{MARKETPLACES.map((marketplace) => {
									const isActive = filters.marketplaceIds.includes(marketplace.id);
									return (
										<button
											key={marketplace.id}
											type="button"
											onClick={() => toggleMarketplace(marketplace.id)}
											className={cn(
												"flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium transition-colors",
												isActive
													? "border-primary bg-primary text-primary-foreground"
													: "border-input bg-background text-foreground hover:bg-accent",
											)}
										>
											<span>{marketplace.flag}</span>
											<span>{marketplace.label}</span>
										</button>
									);
								})}
							</div>
						</FilterSection>
					</div>

					{/* Niches — fills remaining height, scrolls independently */}
					<div className="flex min-h-0 flex-1 flex-col border-t border-border px-1">
						<NichesSectionHeader
							activeFacets={activeFacets}
							nichesSectionOpen={nichesSectionOpen}
							onToggle={() => setNichesSectionOpen(!nichesSectionOpen)}
						/>
						{nichesSectionOpen ? (
							<>
								<div className="shrink-0 border-b border-border">
									<div className="relative">
										<Search className="text-muted-foreground absolute left-3 top-1/2 size-3 -translate-y-1/2" />
										<input
											className="h-8 w-full bg-transparent pl-8 pr-7 text-xs outline-none placeholder:text-muted-foreground"
											placeholder="Filter niches..."
											value={facetSearch}
											onChange={(event) => setFacetSearch(event.target.value)}
										/>
										{facetSearch ? (
											<button
												type="button"
												onClick={() => setFacetSearch("")}
												className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2"
											>
												<X className="size-3" />
											</button>
										) : null}
									</div>
								</div>
								<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1">
									<div className="flex flex-col gap-0.5">
										{filteredFacets.map((facet) => {
											const isActive = activeFacets.includes(facet.label);
											return (
												<button
													key={facet.label}
													type="button"
													onClick={() => toggleFacet(facet.label)}
													className={cn(
														"flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors",
														isActive
															? "bg-primary text-primary-foreground"
															: "text-foreground/80 hover:bg-accent",
													)}
												>
													<span className="text-sm leading-none">{facet.emoji}</span>
													<span className="truncate">{facet.label}</span>
												</button>
											);
										})}
										{filteredFacets.length === 0 ? (
											<p className="text-muted-foreground px-2.5 py-4 text-center text-xs">
												No niches match your search.
											</p>
										) : null}
									</div>
								</div>
							</>
						) : null}
					</div>
				</aside>

				<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
					<div className="min-h-0 flex-1 overflow-hidden">
						<div className="flex h-full min-h-0 flex-col">
							<SearchBar />
							<div className="min-h-0 flex-1">
								<RecentProducts
									filters={filters}
									onStatusChange={handleProductStatusChange}
								/>
							</div>
						</div>
					</div>

					<div className="border-t border-border bg-card px-4 py-2">
						<div className="text-muted-foreground flex items-center justify-between text-xs font-mono">
							<span>
								{activeFilterCount > 0
									? `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} active`
									: "No filters applied"}
							</span>
							<span>
								{productStatus.count > 0
									? productStatus.hasMore
										? `${productStatus.count} products loaded / more available`
										: `${productStatus.count} products loaded`
									: null}
							</span>
							<span>RankWrangler v2.4.1</span>
						</div>
					</div>
				</div>
			</div>

			<SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
		</div>
	);
}

const FilterSection = ({
	title,
	defaultOpen = true,
	children,
}: {
	title: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) => {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div className="border-b border-border last:border-b-0">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex w-full items-center justify-between px-2.5 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
			>
				<span>{title}</span>
				{open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
			</button>
			{open ? <div className="pb-2">{children}</div> : null}
		</div>
	);
};

const NichesSectionHeader = ({
	activeFacets,
	nichesSectionOpen,
	onToggle,
}: {
	activeFacets: string[];
	nichesSectionOpen: boolean;
	onToggle: () => void;
}) => (
	<button
		type="button"
		onClick={onToggle}
		className="flex w-full shrink-0 items-center justify-between px-2.5 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
	>
		<span className="flex items-center gap-1.5">
			Niches
			{activeFacets.length > 0 ? (
				<Badge variant="secondary" className="h-4 rounded-sm px-1.5 text-xs">
					{activeFacets.length}
				</Badge>
			) : null}
		</span>
		{nichesSectionOpen ? (
			<ChevronUp className="size-3.5" />
		) : (
			<ChevronDown className="size-3.5" />
		)}
	</button>
);
