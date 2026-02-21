import { useCallback, useMemo, useReducer, useState, useTransition } from 'react';
import { DashboardFooter } from '@/components/dashboard/app/dashboard-footer';
import { FACETS } from '@/components/dashboard/app/config';
import { FiltersSidebar } from '@/components/dashboard/app/filters-sidebar';
import { TopBar } from '@/components/dashboard/app/top-bar';
import type { BsrRange, LastUpdated } from '@/components/dashboard/app/config';
import { RecentProducts, type FilterState } from '@/components/dashboard/recent-products';
import { SearchBar } from '@/components/dashboard/search-bar';
import { SettingsModal } from '@/components/dashboard/settings-modal';
import { useLicense } from '@/hooks/use-license';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/trpc';

export function App() {
	const [filters, setFilters] = useState<FilterState>({
		bsrRanges: [],
		marketplaceIds: [],
		lastUpdated: 'all',
	});
	const [, startFilterTransition] = useTransition();
	const [uiState, dispatchUiState] = useReducer(appUiStateReducer, INITIAL_APP_UI_STATE);
	const [productStatus, setProductStatus] = useState<{ count: number; hasMore: boolean }>({
		count: 0,
		hasMore: false,
	});
	const { license } = useLicense();
	const { theme, setTheme } = useTheme();
	const { data: keepaStatus } = api.api.app.getKeepaStatus.useQuery(undefined, {
		refetchInterval: 30_000,
		refetchOnWindowFocus: false,
	});

	const handleProductStatusChange = useCallback((info: { count: number; hasMore: boolean }) => {
		setProductStatus(info);
	}, []);

	const toggleBsrRange = useCallback(
		(range: BsrRange) => {
			startFilterTransition(() => {
				setFilters((previous) => ({
					...previous,
					bsrRanges: previous.bsrRanges.includes(range)
						? previous.bsrRanges.filter((currentRange) => currentRange !== range)
						: [...previous.bsrRanges, range],
				}));
			});
		},
		[startFilterTransition],
	);

	const toggleMarketplace = useCallback(
		(marketplaceId: string) => {
			startFilterTransition(() => {
				setFilters((previous) => ({
					...previous,
					marketplaceIds: previous.marketplaceIds.includes(marketplaceId)
						? previous.marketplaceIds.filter((id) => id !== marketplaceId)
						: [...previous.marketplaceIds, marketplaceId],
				}));
			});
		},
		[startFilterTransition],
	);

	const updateLastUpdated = useCallback(
		(nextLastUpdated: LastUpdated) => {
			startFilterTransition(() => {
				setFilters((previous) => ({ ...previous, lastUpdated: nextLastUpdated }));
			});
		},
		[startFilterTransition],
	);

	const activeFilterCount = useMemo(() => {
		let count = 0;
		if (filters.bsrRanges.length > 0) {
			count += 1;
		}
		if (filters.marketplaceIds.length > 0) {
			count += 1;
		}
		if (filters.lastUpdated !== 'all') {
			count += 1;
		}
		return count;
	}, [filters]);

	const filteredFacets = useMemo(() => {
		if (!uiState.facetSearch.trim()) {
			return FACETS;
		}
		const query = uiState.facetSearch.toLowerCase();
		return FACETS.filter((facet) => facet.label.toLowerCase().includes(query));
	}, [uiState.facetSearch]);

	const toggleFacet = useCallback((facetLabel: string) => {
		dispatchUiState({ facetLabel, type: 'toggleFacet' });
	}, []);

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-background">
			<TopBar
				keepaErrors={keepaStatus?.queue.fetchesLastHourError ?? 0}
				keepaSuccess={keepaStatus?.queue.fetchesLastHourSuccess ?? 0}
				keepaTokensLeft={keepaStatus?.tokens.tokensLeft ?? null}
				onOpenSettings={() => dispatchUiState({ open: true, type: 'setSettingsOpen' })}
				onToggleTheme={(event) => setTheme(theme === 'dark' ? 'light' : 'dark', event)}
				productCount={license?.usageCount ?? null}
				theme={theme}
				usageLimit={license?.usageLimit ?? null}
				usageToday={license?.usageToday ?? null}
			/>

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<FiltersSidebar
					activeFacets={uiState.activeFacets}
					facetSearch={uiState.facetSearch}
					filteredFacets={filteredFacets}
					filters={filters}
					nichesSectionOpen={uiState.nichesSectionOpen}
					onFacetSearchChange={(nextValue) =>
						dispatchUiState({ nextValue, type: 'setFacetSearch' })
					}
					onToggleBsrRange={toggleBsrRange}
					onToggleFacet={toggleFacet}
					onToggleMarketplace={toggleMarketplace}
					onToggleNichesSection={() => dispatchUiState({ type: 'toggleNichesSection' })}
					onUpdateLastUpdated={updateLastUpdated}
				/>

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
					<DashboardFooter
						activeFilterCount={activeFilterCount}
						hasMore={productStatus.hasMore}
						productCount={productStatus.count}
					/>
				</div>
			</div>

			<SettingsModal
				open={uiState.settingsOpen}
				onOpenChange={(open) => dispatchUiState({ open, type: 'setSettingsOpen' })}
			/>
		</div>
	);
}

type AppUiState = {
	facetSearch: string;
	activeFacets: string[];
	nichesSectionOpen: boolean;
	settingsOpen: boolean;
};

type AppUiAction =
	| { type: 'setFacetSearch'; nextValue: string }
	| { type: 'toggleFacet'; facetLabel: string }
	| { type: 'toggleNichesSection' }
	| { type: 'setSettingsOpen'; open: boolean };

const INITIAL_APP_UI_STATE: AppUiState = {
	facetSearch: '',
	activeFacets: [],
	nichesSectionOpen: true,
	settingsOpen: false,
};

const appUiStateReducer = (state: AppUiState, action: AppUiAction): AppUiState => {
	switch (action.type) {
		case 'setFacetSearch':
			return { ...state, facetSearch: action.nextValue };
		case 'toggleFacet':
			return {
				...state,
				activeFacets: state.activeFacets.includes(action.facetLabel)
					? state.activeFacets.filter((facet) => facet !== action.facetLabel)
					: [...state.activeFacets, action.facetLabel],
			};
		case 'toggleNichesSection':
			return { ...state, nichesSectionOpen: !state.nichesSectionOpen };
		case 'setSettingsOpen':
			return { ...state, settingsOpen: action.open };
		default:
			return state;
	}
};
