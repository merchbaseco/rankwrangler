import { Segment } from '@heroui-pro/react';
import { useState } from 'react';
import { formatCount } from '@/features/bsr/bsr-format';
import { NicheNeighbours } from '@/features/explore/niche-neighbours';
import { type NicheFacet, nicheValueLabel } from '@/features/niche/niche-facet';
import type { ProductIdentity } from './product-identity';
import { ProductKeywordsTable } from './product-keywords-table';
import { useNearbyProducts } from './use-nearby-products';
import type { ProductKeyword } from './use-product-keywords';

type ProductList = 'keywords' | 'niche';

/**
 * The Product page's lists as one section, switched by a segmented control in
 * its bar (the range control's twin): the keywords grid, and the best of the
 * product's niche. Both choices render from the start, so the bar never
 * re-lays out as reads land: the keyword count holds its width, and Same niche
 * is disabled until a niche is known. The niche read waits until the list is
 * shown or the page's own reads have landed (`isPageReady`), so it never
 * competes with them. On the keywords list the bar's trailing key explains
 * the ringed shelf block.
 */
export const ProductLists = ({
    identity,
    isKeywordsLoading,
    isPageReady,
    keywords,
    keywordTotal,
    niche,
}: {
    identity: ProductIdentity;
    isKeywordsLoading: boolean;
    isPageReady: boolean;
    keywords: readonly ProductKeyword[];
    keywordTotal: number | null;
    niche: NicheFacet | null;
}) => {
    const [selected, setSelected] = useState<ProductList>('keywords');
    const list = niche ? selected : 'keywords';
    const nearby = useNearbyProducts(identity, niche, list === 'niche' || isPageReady);
    return (
        <section aria-label="Product lists" className="product-section">
            <div className="product-section__bar">
                <Segment
                    aria-label="Product lists"
                    onSelectionChange={key => {
                        if (key === 'keywords' || key === 'niche') {
                            setSelected(key);
                        }
                    }}
                    selectedKey={list}
                    size="sm"
                >
                    <Segment.Item id="keywords">
                        Keywords
                        <span className="product-lists__count product-lists__count--figure">
                            {keywordTotal === null ? '' : formatCount(keywordTotal)}
                        </span>
                    </Segment.Item>
                    <Segment.Item id="niche" isDisabled={!niche}>
                        Same niche
                        {niche ? (
                            <span className="product-lists__count">
                                {nicheValueLabel(niche.name)}
                            </span>
                        ) : null}
                    </Segment.Item>
                </Segment>
                <span aria-hidden className="flex-1" />
                {list === 'keywords' && keywords.length > 0 ? (
                    <span className="product-lists__key">
                        <span aria-hidden className="product-lists__swatch top-ten-shelf__mine" />
                        This design on a shelf
                    </span>
                ) : null}
            </div>
            {list === 'niche' && niche ? (
                <NicheNeighbours
                    isLoading={nearby.isLoading}
                    nicheLabel={nicheValueLabel(niche.name)}
                    products={nearby.products}
                />
            ) : (
                <ProductKeywordsTable
                    asin={identity.asin}
                    isLoading={isKeywordsLoading}
                    keywords={keywords}
                />
            )}
        </section>
    );
};
