import { type PointerEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { productHref } from '@/features/explore/product-links';
import { cn } from '@/lib/utils';
import { formatBsr } from './bsr-format';
import { bsrTierDefinitions, classifyBsr, tierClassName } from './bsr-tier';

export const SHELF_SIZE = 10;

export interface ShelfProduct {
    readonly asin: string;
    readonly salesRank: number | null;
    readonly shortName: string | null;
    readonly title?: string | null;
}

/** A shelf product's name: the stored short name, else the catalog title, else its ASIN. */
export const shelfProductName = (product: ShelfProduct) =>
    product.shortName ?? product.title ?? product.asin;

/**
 * The Top 10 shelf: a keyword's first ten Merch results in page placement
 * order, one block per slot coloured by its BSR tier, so a strong search reads
 * as a run of violet and red and a soft one as grey. Fewer than ten Merch
 * results leave hollow slots. Hovering a block names it in a cursor tooltip
 * (placement, short name, BSR, tier); clicking opens the product page.
 *
 * One tooltip serves the whole shelf, re-pointed at the hovered block, so a
 * table of shelves does not mount ten tooltips per row.
 */
export const TopTenShelf = ({
    className,
    highlightAsin,
    keyword,
    shelf,
    size = 'sm',
}: {
    /** Layout only (width, margins). Blocks share the width evenly. */
    className?: string;
    /** Rings this product's block (the Product page marks its own design on each shelf). */
    highlightAsin?: string;
    /** The search the shelf belongs to, for the accessible name. */
    keyword: string;
    shelf: readonly ShelfProduct[];
    /**
     * `lg` fills a Grid I cell (18px blocks); `sm` is a fixed 150px strip
     * (14px blocks); `xs` a side-list cell (12px, 120px).
     */
    size?: 'lg' | 'sm' | 'xs';
}) => {
    const [hovered, setHovered] = useState(0);
    const slots = Array.from({ length: SHELF_SIZE }, (_, index) => shelf[index] ?? null);
    const hoveredProduct = slots[hovered] ?? null;

    return (
        <CursorTooltip
            content={
                <ShelfTooltip
                    isHighlighted={hoveredProduct !== null && hoveredProduct.asin === highlightAsin}
                    placement={hovered + 1}
                    product={hoveredProduct}
                />
            }
            triggerClassName={cn('flex', shelfWidth[size], className)}
        >
            <ul
                aria-label={`Top ${SHELF_SIZE} Merch results for ${keyword}`}
                className={cn('flex w-full', size === 'lg' ? 'gap-1' : 'gap-0.5')}
            >
                {slots.map((product, index) => (
                    <li
                        className={cn('flex flex-1', blockHeight[size])}
                        // biome-ignore lint/suspicious/noArrayIndexKey: shelf slots are positional.
                        key={index}
                        onPointerEnter={() => setHovered(index)}
                    >
                        {product ? (
                            <Link
                                aria-label={`#${index + 1} ${shelfProductName(product)}, ${formatBsr(product.salesRank)}`}
                                className={cn(
                                    tierClassName(classifyBsr(product.salesRank)),
                                    'flex-1 rounded-swatch bg-tier-sw',
                                    product.asin === highlightAsin && 'top-ten-shelf__mine'
                                )}
                                onPointerDown={keepFromRowPress}
                                // Slots are hover targets in a dense table; keyboard users open
                                // products from the row's context menu instead of 10 tab stops.
                                tabIndex={-1}
                                to={productHref({
                                    asin: product.asin,
                                    marketplaceId: usMarketplace,
                                })}
                            />
                        ) : (
                            <span className="flex-1 rounded-swatch bg-surface-secondary ring-1 ring-separator ring-inset" />
                        )}
                    </li>
                ))}
            </ul>
        </CursorTooltip>
    );
};

const ShelfTooltip = ({
    isHighlighted,
    placement,
    product,
}: {
    isHighlighted: boolean;
    placement: number;
    product: ShelfProduct | null;
}) => {
    if (!product) {
        return <span className="text-muted">#{placement} · No Merch result in this slot</span>;
    }
    const tier = bsrTierDefinitions[classifyBsr(product.salesRank)];
    return (
        <span className={cn('flex flex-col', tierClassName(tier.key))}>
            <span>
                <span className="font-mono text-muted">#{placement}</span>{' '}
                {isHighlighted ? 'This design' : shelfProductName(product)}
            </span>
            <span>
                <span className="font-mono font-semibold text-tier-fg">
                    {formatBsr(product.salesRank)}
                </span>
                <span className="text-muted"> · {tier.label}</span>
            </span>
        </span>
    );
};

/**
 * The shelf sits in a grid row whose action opens the keyword, and the row's
 * press starts on pointer down, so a swatch would open the keyword, not its product.
 */
const keepFromRowPress = (event: PointerEvent) => event.stopPropagation();

const shelfWidth = { lg: 'w-full', sm: 'w-[9.375rem]', xs: 'w-[7.5rem]' } as const;
const blockHeight = { lg: 'h-[1.125rem]', sm: 'h-3.5', xs: 'h-3' } as const;

/** The keyword directory covers amazon.com only. */
const usMarketplace = 'ATVPDKIKX0DER';
