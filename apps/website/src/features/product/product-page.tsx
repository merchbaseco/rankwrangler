import { ScrollShadow, Skeleton } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { EmptyState } from '@heroui-pro/react';
import { PackageSearch01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '@/components/ui/icon';
import { NicheNeighbours } from '@/features/explore/niche-neighbours';
import { productArtUrl } from '@/features/explore/product-thumb';
import { nicheValueLabel } from '@/features/niche/niche-facet';
import { Pane, PaneBar, TermScreen } from '@/features/shell/term-pane';
import { ProductFigures } from './product-figures';
import { defaultMarketplaceId, type ProductIdentity } from './product-identity';
import { ProductKeywordsTable } from './product-keywords-table';
import { ProductListing } from './product-listing';
import { ProductRail } from './product-rail';
import { ProductSearch } from './product-search';
import type { HistoryRange } from './rank-history-axis';
import { RankHistoryWidget } from './rank-history-widget';
import { useKeepaHistorySync } from './use-keepa-history-sync';
import { useNearbyProducts } from './use-nearby-products';
import { usePriceTrend } from './use-price-trend';
import { useProductDetail } from './use-product-detail';
import { useProductFacets } from './use-product-facets';
import { useProductKeywords } from './use-product-keywords';
import { useRankHistory } from './use-rank-history';

/**
 * `/products/:asin` in the Grid language (no dedicated mock): a left pane with
 * the name, art and listing as ruled key/value rows; a main pane opening on a
 * KPI header of the figures, then rank history over the tier bands, the
 * keywords grid and the best of its niche, all on the hairline grid. `?marketplace=` picks a non-US marketplace. Keyed by identity so
 * moving between products resets range and sync state.
 */
export const ProductPage = () => {
    const { asin = '' } = useParams();
    const [searchParams] = useSearchParams();
    const marketplaceId = searchParams.get('marketplace') ?? defaultMarketplaceId;
    const identity = useMemo(
        () => ({ asin: asin.toUpperCase(), marketplaceId }),
        [asin, marketplaceId]
    );
    return (
        <>
            <ProductSearch />
            <ProductView identity={identity} key={`${marketplaceId}:${identity.asin}`} />
        </>
    );
};

const ProductView = ({ identity }: { identity: ProductIdentity }) => {
    const [range, setRange] = useState<HistoryRange>('all');
    const detail = useProductDetail(identity);
    const { facets } = useProductFacets(identity);
    const keywords = useProductKeywords(identity);
    const rank = useRankHistory(identity, range);
    const product = detail.product;
    const priceTrend = usePriceTrend(
        identity,
        product?.keepa?.currentNewPrice?.currencyCode ?? null
    );
    const sync = useKeepaHistorySync({
        enabled: product?.amazonListingStatus === 'active',
        identity,
        rank,
    });
    const niche = facets[0] ?? null;
    const nearby = useNearbyProducts(identity, niche);

    if (detail.isLoading) {
        return <ProductPageSkeleton />;
    }
    if (!product) {
        return <ProductMissing error={detail.error?.message ?? null} identity={identity} />;
    }

    const name = product.shortName ?? product.title ?? product.asin;
    return (
        <TermScreen>
            <div className="term-panes">
                <ProductRail
                    art={productArtUrl(product)}
                    facets={facets}
                    identity={identity}
                    name={name}
                    title={product.title}
                >
                    <ProductListing priceTrend={priceTrend} product={product} />
                </ProductRail>
                <Pane className="product-main" label="Product history">
                    <ProductFigures keywordTotals={keywords.totals} product={product} />
                    <ScrollShadow className="min-h-0 flex-1 overflow-y-auto">
                        <RankHistoryWidget
                            category={product.rootCategoryDisplayName}
                            isLoading={rank.isLoading}
                            isSyncing={sync.isSyncing}
                            onRangeChange={setRange}
                            range={range}
                            series={rank.series}
                            syncError={sync.error}
                        />
                        <ProductKeywordsTable
                            isLoading={keywords.isLoading}
                            keywords={keywords.keywords}
                            total={keywords.totals?.keywords ?? null}
                        />
                        {niche ? (
                            <section aria-label="Same niche" className="pane-section">
                                <PaneBar title="Same niche">
                                    <span className="truncate">{nicheValueLabel(niche.name)}</span>
                                </PaneBar>
                                <NicheNeighbours
                                    isLoading={nearby.isLoading}
                                    nicheLabel={nicheValueLabel(niche.name)}
                                    products={nearby.products}
                                />
                            </section>
                        ) : null}
                    </ScrollShadow>
                </Pane>
            </div>
        </TermScreen>
    );
};

const ProductPageSkeleton = () => (
    <TermScreen>
        <div aria-busy="true" className="term-panes">
            <Pane className="product-rail" label="Product">
                <PaneBar title="Product" />
                <div className="pane-body">
                    <Skeleton className="h-6 w-2/3 rounded-none" />
                    <Skeleton className="aspect-square w-full rounded-none" />
                </div>
            </Pane>
            <Pane className="product-main" label="Product history">
                <PaneBar title="Rank history" />
                <Skeleton className="h-60 w-full rounded-none" />
            </Pane>
        </div>
    </TermScreen>
);

const ProductMissing = ({
    error,
    identity,
}: {
    error: string | null;
    identity: ProductIdentity;
}) => (
    <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon icon={PackageSearch01Icon} />
                </EmptyState.Media>
                <EmptyState.Title>
                    {error ? 'Could not load this product' : 'Product not found'}
                </EmptyState.Title>
                <EmptyState.Description>
                    {error ?? `Amazon has no listing for ${identity.asin} in this marketplace.`}
                </EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content>
                <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} to="/explore">
                    Back to Explore
                </Link>
            </EmptyState.Content>
        </EmptyState>
    </div>
);
