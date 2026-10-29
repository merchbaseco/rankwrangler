import { Breadcrumbs, Button, Tooltip } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { Bookmark01Icon, LinkSquare02Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { Icon } from '@/components/ui/icon';
import { amazonUrl } from '@/features/explore/product-links';
import { ProductThumb } from '@/features/explore/product-thumb';
import { type NicheFacet, nicheFacetKey, nicheValueLabel } from '@/features/niche/niche-facet';
import { Pane, PaneBar, PaneBarSpacer, PaneBody } from '@/features/shell/term-pane';
import type { ProductIdentity } from './product-identity';

/**
 * The Product page's left pane: where the product sits (Explore / niche /
 * name) and its two actions in the pane bar, then its name over the full
 * Amazon title, niche facets, the art, and the caller's key/value sections.
 * Save is a placeholder until saved lists exist.
 */
export const ProductRail = ({
    art,
    children,
    facets,
    identity,
    name,
    title,
}: {
    art: string | null;
    children: ReactNode;
    facets: readonly NicheFacet[];
    identity: ProductIdentity;
    name: string;
    title: string | null;
}) => {
    const niche = facets[0] ?? null;
    return (
        <Pane className="product-rail" label="Product">
            <PaneBar title="Product">
                <Breadcrumbs>
                    <Breadcrumbs.Item href="/explore">Explore</Breadcrumbs.Item>
                    {niche ? (
                        <Breadcrumbs.Item
                            href={`/explore?${new URLSearchParams({ niche: nicheFacetKey(niche) })}`}
                        >
                            {nicheValueLabel(niche.name)}
                        </Breadcrumbs.Item>
                    ) : null}
                </Breadcrumbs>
                <PaneBarSpacer />
                <Tooltip>
                    <Tooltip.Trigger<'span'> render={props => <span {...props} />}>
                        <Button isDisabled size="sm" variant="ghost">
                            <Icon icon={Bookmark01Icon} />
                            Save
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content placement="bottom">Coming soon</Tooltip.Content>
                </Tooltip>
                <a
                    className={buttonVariants({ size: 'sm', variant: 'ghost' })}
                    href={amazonUrl(identity)}
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    Amazon
                    <Icon icon={LinkSquare02Icon} />
                </a>
            </PaneBar>
            <PaneBody>
                <div className="flex min-w-0 flex-col">
                    <span className="truncate text-muted">
                        {facets.map(facet => nicheValueLabel(facet.name)).join(' · ') ||
                            'Niche not read yet'}
                    </span>
                    <h1 className="term-title" data-selectable-text>
                        {name}
                    </h1>
                    {title && title !== name ? (
                        <CursorTooltip content={title} triggerClassName="block truncate text-muted">
                            <span data-selectable-text>{title}</span>
                        </CursorTooltip>
                    ) : null}
                </div>
                <ProductThumb alt={name} size="hero" src={art} />
                {children}
            </PaneBody>
        </Pane>
    );
};
