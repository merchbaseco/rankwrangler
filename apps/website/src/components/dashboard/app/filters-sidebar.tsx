import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useState } from "react";
import type {
	LastUpdated,
	MerchListingFilter,
} from "@/components/dashboard/app/config";
import { BsrRangeSlider } from "@/components/dashboard/app/bsr-range-slider";
import {
	LAST_UPDATED_OPTIONS,
	MARKETPLACES,
	MERCH_LISTING_OPTIONS,
} from "@/components/dashboard/app/config";
import { FilterRadioOptions } from "@/components/dashboard/app/filter-radio-options";
import type { FilterState } from "@/components/dashboard/recent-products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const FiltersSidebar = ({
	activeFacets,
	facetSearch,
	filteredFacets,
	filters,
	nichesSectionOpen,
	onBsrRangeChange,
	onFacetSearchChange,
	onToggleFacet,
	onToggleMarketplace,
	onToggleNichesSection,
	onUpdateLastUpdated,
	onUpdateMerchListing,
}: {
	activeFacets: string[];
	facetSearch: string;
	filteredFacets: Array<{ emoji: string; key: string; label: string }>;
	filters: FilterState;
	nichesSectionOpen: boolean;
	onBsrRangeChange: (range: [number, number] | null) => void;
	onFacetSearchChange: (nextValue: string) => void;
	onToggleFacet: (facetLabel: string) => void;
	onToggleMarketplace: (marketplaceId: string) => void;
	onToggleNichesSection: () => void;
	onUpdateLastUpdated: (value: LastUpdated) => void;
	onUpdateMerchListing: (value: MerchListingFilter) => void;
}) => (
	<aside className="flex h-full w-[230px] shrink-0 flex-col border-r border-border bg-sidebar">
		<div className="shrink-0">
			<FilterSection defaultOpen title="Listing Type">
				<FilterRadioOptions
					onSelect={onUpdateMerchListing}
					options={MERCH_LISTING_OPTIONS}
					selected={filters.merchListing}
				/>
			</FilterSection>

			<FilterSection title="BSR Range">
				<BsrRangeSlider
					bsrRange={filters.bsrRange}
					onChange={onBsrRangeChange}
				/>
			</FilterSection>

			<FilterSection title="Last Updated">
				<FilterRadioOptions
					onSelect={onUpdateLastUpdated}
					options={LAST_UPDATED_OPTIONS}
					selected={filters.lastUpdated}
				/>
			</FilterSection>

			<FilterSection title="Marketplace">
				<div className="flex flex-wrap gap-1 px-1">
					{MARKETPLACES.map((marketplace) => {
						const isActive = filters.marketplaceIds.includes(marketplace.id);
						return (
							<Button
								key={marketplace.id}
								onClick={() => onToggleMarketplace(marketplace.id)}
								className={cn(
									"h-auto gap-1 rounded-sm border px-2 py-1 text-xs font-medium",
									isActive
										? "border-primary bg-primary text-primary-foreground"
										: "border-input bg-background text-foreground hover:bg-accent",
								)}
								size="sm"
								variant="ghost"
							>
								<span>{marketplace.flag}</span>
								<span>{marketplace.label}</span>
							</Button>
						);
					})}
				</div>
			</FilterSection>
		</div>

		<div className="flex min-h-0 flex-1 flex-col border-t border-border">
			<NichesSectionHeader
				activeFacets={activeFacets}
				nichesSectionOpen={nichesSectionOpen}
				onToggle={onToggleNichesSection}
			/>
			{nichesSectionOpen ? (
				<>
					<div className="shrink-0 border-b border-border">
						<div className="relative">
							<Search className="text-muted-foreground absolute left-3 top-1/2 size-3 -translate-y-1/2" />
							<Input
								className="h-8 rounded-none border-0 bg-transparent pl-8 pr-7 text-xs shadow-none focus-within:ring-0"
								placeholder="Filter niches..."
								value={facetSearch}
								onChange={(event) => onFacetSearchChange(event.target.value)}
							/>
							{facetSearch ? (
								<Button
									aria-label="Clear niche search"
									className="absolute right-2.5 top-1/2 size-6 -translate-y-1/2 rounded-sm p-0 text-muted-foreground hover:text-foreground"
									onClick={() => onFacetSearchChange("")}
									size="sm"
									variant="ghost"
								>
									<X className="size-3" />
								</Button>
							) : null}
						</div>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1">
						<div className="flex flex-col gap-0.5">
							{filteredFacets.map((facet) => {
								const isActive = activeFacets.includes(facet.key);
								return (
									<Button
										key={facet.key}
										onClick={() => onToggleFacet(facet.key)}
										className={cn(
											"h-auto justify-start gap-2 rounded-sm px-2.5 py-1.5 text-sm",
											!isActive && "text-foreground/80 hover:bg-accent",
										)}
										size="sm"
										variant={isActive ? "default" : "ghost"}
									>
										<span className="text-sm leading-none">{facet.emoji}</span>
										<span className="truncate">{facet.label}</span>
									</Button>
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
);

const FilterSection = ({
	defaultOpen = false,
	title,
	children,
}: {
	defaultOpen?: boolean;
	title: string;
	children: React.ReactNode;
}) => {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div className="border-b border-border last:border-b-0">
			<Button
				className="h-9 w-full justify-between rounded-none px-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
				onClick={() => setOpen(!open)}
				size="sm"
				variant="ghost"
			>
				<span>{title}</span>
				{open ? (
					<ChevronUp className="size-3.5" />
				) : (
					<ChevronDown className="size-3.5" />
				)}
			</Button>
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
	<Button
		className="h-9 w-full shrink-0 justify-between rounded-none px-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
		onClick={onToggle}
		size="sm"
		variant="ghost"
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
	</Button>
);
