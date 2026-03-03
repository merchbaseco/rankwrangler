import { useCallback, useMemo, useReducer, useState, useTransition } from 'react';
import { DashboardFooter } from '@/components/dashboard/app/dashboard-footer';
import { FiltersSidebar } from '@/components/dashboard/app/filters-sidebar';
import { TopBar } from '@/components/dashboard/app/top-bar';
import type { LastUpdated } from '@/components/dashboard/app/config';
import { KeywordsPage } from '@/components/dashboard/keywords/keywords-page';
import { LogsPage } from '@/components/dashboard/logs/logs-page';
import { RecentProducts, type FilterState } from '@/components/dashboard/recent-products';
import { SearchBar } from '@/components/dashboard/search-bar';
import { SettingsModal } from '@/components/dashboard/settings-modal';
import { useLicense } from '@/hooks/use-license';
import { useTheme } from '@/hooks/use-theme';

export function App() {
	const [activePage, setActivePage] = useState<'products' | 'logs' | 'keywords'>('products');
	const [searchValue, setSearchValue] = useState('');
	const [filters, setFilters] = useState<FilterState>({
		bsrRange: null,
		marketplaceIds: [],
		lastUpdated: 'all',
	});
	const [, startFilterTransition] = useTransition();
	const [uiState, dispatchUiState] = useReducer(appUiStateReducer, INITIAL_APP_UI_STATE);
	const [productStatus, setProductStatus] = useState<{
		availableFacets: Array<{ emoji: string; key: string; label: string }>;
		count: number;
		hasMore: boolean;
		totalProducts: number | null;
		totalMerchProducts: number | null;
	}>({
		availableFacets: [],
		count: 0,
		hasMore: false,
		totalMerchProducts: null,
		totalProducts: null,
	});
	const { license } = useLicense();
	const { theme, setTheme } = useTheme();

	const handleProductStatusChange = useCallback(
		(info: {
			availableFacets: Array<{ emoji: string; key: string; label: string }>;
			count: number;
			hasMore: boolean;
			totalProducts: number | null;
			totalMerchProducts: number | null;
		}) => {
			setProductStatus(info);
		},
		[],
	);

	const setBsrRange = useCallback(
		(range: [number, number] | null) => {
			startFilterTransition(() => {
				setFilters((previous) => ({ ...previous, bsrRange: range }));
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
		if (filters.bsrRange !== null) {
			count += 1;
		}
		if (filters.marketplaceIds.length > 0) {
			count += 1;
		}
		if (filters.lastUpdated !== 'all') {
			count += 1;
		}
		if (uiState.activeFacets.length > 0) {
			count += 1;
		}
		return count;
	}, [filters, uiState.activeFacets.length]);

	const filteredFacets = useMemo(() => {
		if (!uiState.facetSearch.trim()) {
			return productStatus.availableFacets;
		}
		const query = uiState.facetSearch.toLowerCase();
		return productStatus.availableFacets.filter((facet) =>
			facet.label.toLowerCase().includes(query),
		);
	}, [productStatus.availableFacets, uiState.facetSearch]);

	const toggleFacet = useCallback((facetLabel: string) => {
		dispatchUiState({ facetLabel, type: 'toggleFacet' });
	}, []);

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-background">
			<TopBar
				activePage={activePage}
				onPageChange={setActivePage}
				onOpenSettings={() => dispatchUiState({ open: true, type: 'setSettingsOpen' })}
				onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
				totalMerchProducts={productStatus.totalMerchProducts}
				totalProducts={productStatus.totalProducts}
				theme={theme}
				usageLimit={license?.usageLimit ?? null}
				usageToday={license?.usageToday ?? null}
			/>

			<div className="flex min-h-0 flex-1 overflow-hidden">
				{activePage === 'products' ? (
					<>
						<FiltersSidebar
							activeFacets={uiState.activeFacets}
							facetSearch={uiState.facetSearch}
							filteredFacets={filteredFacets}
							filters={filters}
							nichesSectionOpen={uiState.nichesSectionOpen}
							onFacetSearchChange={(nextValue) =>
								dispatchUiState({ nextValue, type: 'setFacetSearch' })
							}
							onBsrRangeChange={setBsrRange}
							onToggleFacet={toggleFacet}
							onToggleMarketplace={toggleMarketplace}
							onToggleNichesSection={() => dispatchUiState({ type: 'toggleNichesSection' })}
							onUpdateLastUpdated={updateLastUpdated}
						/>

						<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
							<div className="min-h-0 flex-1 overflow-hidden">
								<div className="flex h-full min-h-0 flex-col">
									<SearchBar
										searchValue={searchValue}
										onSearchValueChange={setSearchValue}
									/>
									<div className="min-h-0 flex-1">
										<RecentProducts
											activeFacetKeys={uiState.activeFacets}
											filters={filters}
											searchValue={searchValue}
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
					</>
				) : activePage === 'logs' ? (
					<div className="min-h-0 min-w-0 flex-1">
						<LogsPage />
					</div>
				) : (
					<div className="min-h-0 min-w-0 flex-1">
						<KeywordsPage />
					</div>
				)}
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
