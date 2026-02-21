import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { FilterState } from '@/components/dashboard/recent-products';
import {
	BSR_OPTIONS,
	LAST_UPDATED_OPTIONS,
	MARKETPLACES,
} from '@/components/dashboard/app/config';
import type {
	BsrRange,
	LastUpdated,
} from '@/components/dashboard/app/config';
import { cn } from '@/lib/utils';

export const FiltersSidebar = ({
	activeFacets,
	facetSearch,
	filteredFacets,
	filters,
	nichesSectionOpen,
	onFacetSearchChange,
	onToggleBsrRange,
	onToggleFacet,
	onToggleMarketplace,
	onToggleNichesSection,
	onUpdateLastUpdated,
}: {
	activeFacets: string[];
	facetSearch: string;
	filteredFacets: Array<{ emoji: string; label: string }>;
	filters: FilterState;
	nichesSectionOpen: boolean;
	onFacetSearchChange: (nextValue: string) => void;
	onToggleBsrRange: (range: BsrRange) => void;
	onToggleFacet: (facetLabel: string) => void;
	onToggleMarketplace: (marketplaceId: string) => void;
	onToggleNichesSection: () => void;
	onUpdateLastUpdated: (value: LastUpdated) => void;
}) => (
	<aside className="flex h-full w-[230px] shrink-0 flex-col border-r border-border bg-sidebar">
		<div className="shrink-0">
			<FilterSection title="BSR Range">
				<div className="flex flex-col gap-0.5">
					{BSR_OPTIONS.map((option) => {
						const isActive = filters.bsrRanges.includes(option.key);
						return (
							<button
								key={option.key}
								type="button"
								onClick={() => onToggleBsrRange(option.key)}
								className={cn(
									'flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors',
									isActive
										? 'bg-primary text-primary-foreground'
										: 'text-foreground/80 hover:bg-accent',
								)}
							>
								<span
									className={cn(
										'flex size-3.5 items-center justify-center rounded-sm border text-xs',
										isActive
											? 'border-primary-foreground bg-primary-foreground text-primary'
											: 'border-input',
									)}
								>
									{isActive ? '✓' : null}
								</span>
								<span>{option.label}</span>
							</button>
						);
					})}
				</div>
			</FilterSection>

			<FilterSection title="Last Updated">
				<div className="flex flex-col gap-0.5">
					{LAST_UPDATED_OPTIONS.map((option) => {
						const isActive = filters.lastUpdated === option.key;
						return (
							<button
								key={option.key}
								type="button"
								onClick={() => onUpdateLastUpdated(option.key)}
								className={cn(
									'flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors',
									isActive
										? 'bg-primary text-primary-foreground'
										: 'text-foreground/80 hover:bg-accent',
								)}
							>
								<span
									className={cn(
										'flex size-3.5 items-center justify-center rounded-full border',
										isActive ? 'border-primary-foreground' : 'border-input',
									)}
								>
									{isActive ? <span className="size-2 rounded-full bg-primary-foreground" /> : null}
								</span>
								<span>{option.label}</span>
							</button>
						);
					})}
				</div>
			</FilterSection>

			<FilterSection title="Marketplace">
				<div className="flex flex-wrap gap-1 px-1">
					{MARKETPLACES.map((marketplace) => {
						const isActive = filters.marketplaceIds.includes(marketplace.id);
						return (
							<button
								key={marketplace.id}
								type="button"
								onClick={() => onToggleMarketplace(marketplace.id)}
								className={cn(
									'flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium transition-colors',
									isActive
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-input bg-background text-foreground hover:bg-accent',
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
							<input
								className="h-8 w-full bg-transparent pl-8 pr-7 text-xs outline-none placeholder:text-muted-foreground"
								placeholder="Filter niches..."
								value={facetSearch}
								onChange={(event) => onFacetSearchChange(event.target.value)}
							/>
							{facetSearch ? (
								<button
									type="button"
									onClick={() => onFacetSearchChange('')}
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
										onClick={() => onToggleFacet(facet.label)}
										className={cn(
											'flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors',
											isActive
												? 'bg-primary text-primary-foreground'
												: 'text-foreground/80 hover:bg-accent',
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
);

const FilterSection = ({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) => {
	const [open, setOpen] = useState(false);

	return (
		<div className="border-b border-border last:border-b-0">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex h-9 w-full items-center justify-between px-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
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
		className="flex h-9 w-full shrink-0 items-center justify-between px-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
	>
		<span className="flex items-center gap-1.5">
			Niches
			{activeFacets.length > 0 ? (
				<Badge variant="secondary" className="h-4 rounded-sm px-1.5 text-xs">
					{activeFacets.length}
				</Badge>
			) : null}
		</span>
		{nichesSectionOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
	</button>
);
