import { ChartSection } from '@/components/dashboard/product-history-panel/chart-section';
import { DateRangeSelector } from '@/components/dashboard/product-history-panel/date-range-selector';
import { PanelHeader } from '@/components/dashboard/product-history-panel/panel-header';
import type { ProductHistoryPanelProps } from '@/components/dashboard/product-history-panel/types';
import { useProductHistoryPanelData } from '@/components/dashboard/product-history-panel/use-product-history-panel-data';

export const ProductHistoryPanel = ({ product }: ProductHistoryPanelProps) => {
	const {
		activePreset,
		chartTimeDomain,
		customRange,
		datePickerRange,
		handleDayClick,
		handleDateRangeSelect,
		handlePresetClick,
		isKeepaSyncStale,
		keepaLastSyncAt,
		loadMutation,
		priceQuery,
		product: headerProduct,
		rankMetric,
		rankMetricValue,
		rankQuery,
		rankSelectOptions,
		setRankMetricValue,
		triggerKeepaSync,
	} = useProductHistoryPanelData({ product });

    return (
        <div className="flex h-full flex-col overflow-y-auto bg-background">
            <PanelHeader
                product={headerProduct}
                onSync={triggerKeepaSync}
                isSyncing={loadMutation.isPending}
                isKeepaSyncStale={isKeepaSyncStale}
                keepaLastSyncAt={keepaLastSyncAt}
            />
            <DateRangeSelector
                activePreset={activePreset}
                customRange={customRange}
                datePickerRange={datePickerRange}
                onDayClick={handleDayClick}
                onDateRangeSelect={handleDateRangeSelect}
                onPresetClick={handlePresetClick}
            />
            <div className="flex flex-1 flex-col">
                <ChartSection
                    label="Rank"
                    selectValue={rankMetricValue}
                    onSelectChange={setRankMetricValue}
                    selectOptions={rankSelectOptions}
                    query={rankQuery}
                    metric={rankMetric}
                    isPrice={false}
                    gradientId={`rank-${product.asin}`}
                    isSyncing={loadMutation.isPending}
                    timeDomain={chartTimeDomain}
                />
                <ChartSection
                    label="Price (New)"
                    selectValue=""
                    onSelectChange={() => {}}
                    selectOptions={[]}
                    query={priceQuery}
                    metric="priceNew"
                    isPrice={true}
                    gradientId={`price-${product.asin}`}
                    isSyncing={loadMutation.isPending}
                    timeDomain={chartTimeDomain}
                />
            </div>
        </div>
    );
};
