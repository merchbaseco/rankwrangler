import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    ChartLineData01Icon,
    Copy01Icon,
    LinkSquare02Icon,
    Store01Icon,
    Tag01Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import type { Key } from 'react-aria-components';
import { Icon } from '@/components/ui/icon';
import { type NicheFacet, nicheFacetKey, nicheValueLabel } from '@/features/niche/niche-facet';
import { useRowMenuTarget } from '@/hooks/use-row-menu-target';
import { amazonUrl, productHref } from './product-links';

export type ProductRowFilter = { brand: string } | { niche: string };

/** What a product row needs for its menu; brand and niche unlock the filter items. */
export interface MenuProduct {
    readonly asin: string;
    readonly marketplaceId: string;
    readonly brand?: string | null;
    readonly facets?: readonly NicheFacet[];
}

/**
 * One context menu for a product grid (useRowMenuTarget): open the design here
 * or on Amazon, copy its ASIN, or (with `onFilter`) narrow Explore to its
 * niche or brand. Opens on right-click or from a focused row with Shift+F10 or
 * the Menu key. Items with nothing to act on are left out. `fill` lets the
 * trigger stretch a pane's main grid; side lists keep their own height.
 */
export const ProductRowMenu = ({
    attribute,
    children,
    fill = false,
    onFilter,
    rows,
}: {
    /** The cell attribute carrying each row's ASIN. */
    attribute: string;
    children: ReactNode;
    fill?: boolean;
    onFilter?: (filter: ProductRowFilter) => void;
    rows: readonly MenuProduct[];
}) => {
    const { target, triggerProps } = useRowMenuTarget(attribute, asin =>
        rows.find(row => row.asin === asin)
    );
    const niche = onFilter ? target?.facets?.[0] : undefined;
    const brand = onFilter ? target?.brand : undefined;
    const handleAction = (key: Key) => {
        if (!target) {
            return;
        }
        const product = target;
        switch (key) {
            case 'copy':
                navigator.clipboard.writeText(product.asin).catch((error: unknown) => {
                    console.error('Copy ASIN failed', error);
                });
                return;
            case 'niche':
                if (niche) {
                    onFilter?.({ niche: nicheFacetKey(niche) });
                }
                return;
            case 'brand':
                if (brand) {
                    onFilter?.({ brand });
                }
                return;
            default:
                return;
        }
    };

    return (
        <ContextMenu>
            <ContextMenu.Trigger
                className={fill ? 'flex min-h-0 flex-1 flex-col' : 'block'}
                {...triggerProps}
            >
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu
                    aria-label={`Actions for ${target?.asin ?? 'design'}`}
                    onAction={handleAction}
                >
                    <ContextMenu.Item
                        href={target ? productHref(target) : undefined}
                        id="open"
                        textValue="Open product"
                    >
                        <Icon icon={ChartLineData01Icon} />
                        <Label>Open product</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                        href={target ? amazonUrl(target) : undefined}
                        id="amazon"
                        rel="noopener noreferrer"
                        target="_blank"
                        textValue="Open on Amazon"
                    >
                        <Icon icon={LinkSquare02Icon} />
                        <Label>Open on Amazon</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Item id="copy" textValue="Copy ASIN">
                        <Icon icon={Copy01Icon} />
                        <Label>Copy ASIN</Label>
                    </ContextMenu.Item>
                    {niche || brand ? <ContextMenu.Separator /> : null}
                    {niche ? (
                        <ContextMenu.Item id="niche" textValue="Filter to this niche">
                            <Icon icon={Tag01Icon} />
                            <Label>Filter to {nicheValueLabel(niche.name)}</Label>
                        </ContextMenu.Item>
                    ) : null}
                    {brand ? (
                        <ContextMenu.Item id="brand" textValue="Filter to this brand">
                            <Icon icon={Store01Icon} />
                            <Label>Filter to {brand}</Label>
                        </ContextMenu.Item>
                    ) : null}
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
};
