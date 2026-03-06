import { useMemo } from 'react';
import { AmazonResultsTable } from '@/components/dashboard/keywords/amazon-results-table';
import {
	TrendChart,
	type TrendMetric,
	type TrendPoint,
} from '@/components/dashboard/keywords/trend-chart';
import { api } from '@/lib/trpc';

const MARKETPLACE_ID = 'ATVPDKIKX0DER';

export const TrendCanvas = ({
	selectedSearchTerm,
    reportPeriod,
}: {
	selectedSearchTerm: string | null;
    reportPeriod: 'DAY' | 'WEEK';
}) => {
	const trendQuery = api.api.app.searchterms.trend.useQuery(
		{
			marketplaceId: MARKETPLACE_ID,
			rangeDays: 90,
			reportPeriod,
			searchTerm: selectedSearchTerm ?? '',
		},
		{
			enabled: Boolean(selectedSearchTerm),
			refetchOnWindowFocus: false,
		},
	);
	const amazonQuery = api.api.app.amazon.search.useQuery(
		{ keyword: selectedSearchTerm ?? '' },
		{
			enabled: Boolean(selectedSearchTerm),
			refetchOnWindowFocus: false,
			staleTime: 5 * 60 * 1000,
		},
	);

	const points = (trendQuery.data?.points ?? []) as TrendPoint[];
	const latestPoint = points.at(-1) ?? null;
	const metricOptions = useMemo(
		() => [
			{ key: 'searchFrequencyRank' as const, label: 'Rank' },
			{ key: 'clickShareTop3Sum' as const, label: 'Click Share' },
			{ key: 'conversionShareTop3Sum' as const, label: 'Conv Share' },
		],
		[],
	);

	if (!selectedSearchTerm) {
		return (
			<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
				Select a search term to view trend history and Amazon results.
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="border-border shrink-0 border-b">
				<div className="border-border border-l border-r bg-card">
					{trendQuery.isLoading ? (
						<div className="bg-muted h-[232px] animate-pulse" />
					) : trendQuery.error ? (
						<div className="text-destructive flex h-[232px] items-center justify-center text-sm">
							Failed to load trend history.
						</div>
					) : (
						<div className="divide-border grid grid-cols-3 divide-x">
							{metricOptions.map((option) => {
								const latestValue = latestPoint ? latestPoint[option.key] : null;
								return (
									<div key={option.key} className="min-w-0 border-border">
										<div className="border-border flex h-10 items-center justify-between border-b px-2">
											<span className="text-xs font-semibold uppercase tracking-wide text-foreground">
												{option.label}
											</span>
											<span className="text-muted-foreground font-mono text-sm">
												{formatMetricValue(latestValue, option.key)}
											</span>
										</div>
										<TrendChart metric={option.key} points={points} className="h-[192px]" />
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden">
				<div className="border-border flex h-10 items-center border-b px-3 text-xs">
					<span className="font-medium text-foreground">Amazon Results</span>
					<span className="text-muted-foreground ml-2">
						{amazonQuery.data
							? `${amazonQuery.data.items.length} results`
							: amazonQuery.isLoading
								? 'Loading…'
								: 'No results'}
					</span>
				</div>
				<div className="min-h-0 h-[calc(100%-2.5rem)] overflow-hidden">
					<AmazonResultsTable
						items={amazonQuery.data?.items ?? []}
						isLoading={amazonQuery.isLoading}
						errorMessage={amazonQuery.error ? 'Failed to load Amazon results.' : null}
					/>
				</div>
			</div>
		</div>
	);
};

const formatMetricValue = (value: number | null, metric: TrendMetric) => {
	if (value === null) {
		return '--';
	}

	if (metric === 'searchFrequencyRank') {
		return `#${Math.round(value).toLocaleString()}`;
	}

	return `${(value * 100).toFixed(2)}%`;
};
