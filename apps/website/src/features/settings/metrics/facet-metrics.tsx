import { DataGrid, type DataGridColumn, ItemCard, ItemCardGroup } from '@heroui-pro/react';
import type { RouterOutputs } from '@/lib/trpc';
import { formatCount } from './metric-format';
import { MetricKpiGroup } from './metric-kpi-group';
import { MetricsState } from './metrics-state';
import { statTile } from './stat-tiles';
import { useFacetMetrics } from './use-facet-metrics';

type FacetValueTotal =
    RouterOutputs['api']['app']['getProductFacetMetricsSummary']['facetValueTotals'][number];

export const FacetMetrics = () => {
    const query = useFacetMetrics();

    if (!query.data) {
        return <MetricsState error={Boolean(query.error)} label="Facet metrics" />;
    }

    const { facetCategoryTotals, facetValueTotals, stats } = query.data;

    return (
        <div className="flex flex-col gap-4">
            <MetricKpiGroup tiles={stats.map(stat => statTile(stat))} />
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Products per facet</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup columns={3} layout="grid">
                    {facetCategoryTotals.map(category => (
                        <ItemCard key={category.facet}>
                            <ItemCard.Content>
                                <ItemCard.Title>{facetName(category.facet)}</ItemCard.Title>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <span className="font-mono font-semibold">
                                    {formatCount(category.productCount)}
                                </span>
                            </ItemCard.Action>
                        </ItemCard>
                    ))}
                </ItemCardGroup>
            </ItemCardGroup>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Facet values</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <DataGrid
                    aria-label="Facet values"
                    columns={columns}
                    data={facetValueTotals}
                    defaultSortDescriptor={{ column: 'productCount', direction: 'descending' }}
                    getRowId={value => `${value.facet}:${value.name}`}
                    renderEmptyState={() => 'No facet values assigned yet.'}
                />
            </ItemCardGroup>
        </div>
    );
};

const columns: DataGridColumn<FacetValueTotal>[] = [
    {
        allowsSorting: true,
        cell: value => <span className="text-muted">{facetName(value.facet)}</span>,
        header: 'Facet',
        id: 'facet',
        sortFn: (a, b) => facetName(a.facet).localeCompare(facetName(b.facet)),
        width: 160,
    },
    {
        accessorKey: 'name',
        allowsSorting: true,
        cell: value => <span data-selectable-text>{value.name}</span>,
        header: 'Value',
        id: 'name',
        isRowHeader: true,
    },
    {
        align: 'end',
        allowsSorting: true,
        cell: value => <span className="font-mono">{formatCount(value.productCount)}</span>,
        header: 'Products',
        id: 'productCount',
        sortFn: (a, b) => a.productCount - b.productCount,
        width: 120,
    },
];

const facetName = (facet: string) => facetNames[facet] ?? facet;

const facetNames: Readonly<Record<string, string>> = {
    animal: 'Animal',
    cause: 'Cause',
    culture: 'Culture',
    food: 'Food',
    hobby: 'Hobby',
    holiday: 'Holiday',
    identity: 'Identity',
    occasion: 'Occasion',
    'party-theme': 'Party theme',
    place: 'Place',
    profession: 'Profession',
};
