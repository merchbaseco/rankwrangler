import { ScrollShadow } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { EmptyState } from '@heroui-pro/react';
import { PackageSearch01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '@/components/ui/icon';
import { productArtUrl } from '@/features/explore/product-thumb';
import { ProductFigures } from './product-figures';
import { defaultMarketplaceId, type ProductIdentity } from './product-identity';
import { ProductListing } from './product-listing';
import { ProductLists } from './product-lists';
import { ProductSearch } from './product-search';
import { ProductSidebar } from './product-sidebar';
import type { HistoryRange } from './rank-history-axis';
import { RankHistoryWidget } from './rank-history-widget';
import { useKeepaHistorySync } from './use-keepa-history-sync';
import { usePriceTrend } from './use-price-trend';
import { useProductDetail } from './use-product-detail';
import { useProductFacets } from './use-product-facets';
import { useProductKeywords } from './use-product-keywords';
import { useRankHistory } from './use-rank-history';

/**
 * `/products/:asin` in the Grid language (mock A · Dossier): the product
 * sidebar where Explore and Keywords keep their filters (art, name, actions,
 * listing, niche), and one scrolling main column with the KPI header and its
 * bands, the halftone rank history, and the keywords grid tabbed with the best
 * of its niche. All reads start together and the frame renders before any
 * lands, every section at its final size, so nothing shifts as they arrive.
 * `?marketplace=` picks a non-US marketplace. Keyed by identity so moving
 * between products resets range and sync state.
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
    const facets = useProductFacets(identity);
    const keywords = useProductKeywords(identity);
    const rank = useRankHistory(identity, range);
    // The KPI bands read the whole history; with the default range this is the chart's own query.
    const history = useRankHistory(identity, 'all');
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

    if (!(detail.isLoading || product)) {
        return <ProductMissing error={detail.error?.message ?? null} identity={identity} />;
    }

    // The frame renders at once: each section holds its final size and fills in as its read lands.
    const name = product ? (product.shortName ?? product.title ?? product.asin) : null;
    return (
        <section aria-busy={detail.isLoading} aria-label="Product" className="product-screen">
            <ProductSidebar
                art={product ? productArtUrl(product) : null}
                brand={product?.brand ?? null}
                brandDesignCount={product?.brandDesignCount ?? null}
                facets={facets.facets}
                identity={identity}
                isFacetsLoading={facets.isLoading}
                isLoading={detail.isLoading}
                name={name}
                title={product?.title ?? null}
            >
                <ProductListing asin={identity.asin} priceTrend={priceTrend} product={product} />
            </ProductSidebar>
            <ScrollShadow className="product-main">
                <ProductFigures
                    history={history.series}
                    keywords={keywords.keywords}
                    keywordTotals={keywords.totals}
                    product={product}
                />
                <RankHistoryWidget
                    category={product?.rootCategoryDisplayName ?? null}
                    isLoading={rank.isLoading}
                    isSyncing={sync.isSyncing}
                    onRangeChange={setRange}
                    range={range}
                    series={rank.series}
                    syncError={sync.error}
                />
                <ProductLists
                    identity={identity}
                    isKeywordsLoading={keywords.isLoading}
                    isPageReady={!(detail.isLoading || keywords.isLoading || rank.isLoading)}
                    keywordTotal={keywords.totals?.keywords ?? null}
                    keywords={keywords.keywords}
                    niche={facets.facets[0] ?? null}
                />
            </ScrollShadow>
        </section>
    );
};

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
