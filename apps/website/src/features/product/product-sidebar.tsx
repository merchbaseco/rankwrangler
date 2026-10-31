import { Breadcrumbs, Button, Skeleton, Tooltip } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { Bookmark01Icon, LinkSquare02Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatCount } from '@/features/bsr/bsr-format';
import { Icon } from '@/components/ui/icon';
import { amazonUrl } from '@/features/explore/product-links';
import { ProductThumb } from '@/features/explore/product-thumb';
import {
    type NicheFacet,
    nicheCategoryLabel,
    nicheFacetIcon,
    nicheFacetKey,
    nicheValueLabel,
} from '@/features/niche/niche-facet';
import type { ProductIdentity } from './product-identity';

/**
 * The Product page's sidebar, in the place and density of the Explore and
 * Keywords filter sidebar (Grid J `.side`): where the product sits (Explore /
 * niche), its art, name, brand and full Amazon title, its two actions, the listing
 * as ruled key/value rows (the caller's `children`), and each niche facet as
 * a row that opens Explore narrowed to it. Save is a placeholder until saved
 * lists exist. It renders at once and keeps its height as the product loads:
 * the name holds two lines and brand and title one each, skeletons until the
 * text arrives, and the listing rows always render.
 */
export const ProductSidebar = ({
    art,
    brand,
    brandDesignCount,
    children,
    facets,
    identity,
    isFacetsLoading,
    isLoading,
    name,
    title,
}: {
    art: string | null;
    brand: string | null;
    /** The brand's designs in the catalog. */
    brandDesignCount: number | null;
    children: ReactNode;
    facets: readonly NicheFacet[];
    identity: ProductIdentity;
    isFacetsLoading: boolean;
    isLoading: boolean;
    name: string | null;
    title: string | null;
}) => {
    const niche = facets[0] ?? null;
    return (
        <aside aria-label="Product" className="grid-sidebar product-sidebar">
            <Breadcrumbs>
                <Breadcrumbs.Item href="/explore">Explore</Breadcrumbs.Item>
                {niche ? (
                    <Breadcrumbs.Item href={nicheHref(niche)}>
                        {nicheValueLabel(niche.name)}
                    </Breadcrumbs.Item>
                ) : null}
            </Breadcrumbs>
            <ProductThumb alt={name ?? ''} size="hero" src={art} />
            <div className="product-sidebar__identity">
                {name ? (
                    <h1 className="product-sidebar__name" data-selectable-text>
                        {name}
                    </h1>
                ) : (
                    <div aria-hidden className="product-sidebar__name">
                        <Skeleton className="h-4 w-4/5 rounded-none" />
                    </div>
                )}
                <div className="product-sidebar__line">
                    {isLoading ? <Skeleton className="h-3 w-1/2 rounded-none" /> : null}
                    {brand ? (
                        <span className="product-sidebar__brand">
                            <Link
                                className="product-sidebar__brand-link"
                                to={`/explore?${new URLSearchParams({ brand })}`}
                            >
                                <span data-selectable-text>{brand}</span>
                            </Link>
                            {brandDesignCount ? (
                                <span className="shrink-0">
                                    · {formatCount(brandDesignCount)}{' '}
                                    {brandDesignCount === 1 ? 'design' : 'designs'}
                                </span>
                            ) : null}
                        </span>
                    ) : null}
                </div>
                <div className="product-sidebar__line">
                    {isLoading ? <Skeleton className="h-3 w-full rounded-none" /> : null}
                    {title && title !== name ? (
                        <CursorTooltip content={title} triggerClassName="flex min-w-0">
                            <span className="product-sidebar__title" data-selectable-text>
                                {title}
                            </span>
                        </CursorTooltip>
                    ) : null}
                </div>
            </div>
            <div className="product-sidebar__actions">
                <a
                    className={buttonVariants({ fullWidth: true, size: 'sm', variant: 'secondary' })}
                    href={amazonUrl(identity)}
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    Amazon
                    <Icon icon={LinkSquare02Icon} />
                </a>
                <Tooltip>
                    <Tooltip.Trigger<'span'> render={props => <span {...props} />}>
                        <Button fullWidth isDisabled size="sm" variant="secondary">
                            <Icon icon={Bookmark01Icon} />
                            Save
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content placement="bottom">Coming soon</Tooltip.Content>
                </Tooltip>
            </div>
            <section aria-label="Listing" className="product-sidebar__section">
                <h2 className="product-sidebar__heading">Listing</h2>
                {children}
            </section>
            <section aria-label="Niche" className="product-sidebar__section">
                <h2 className="product-sidebar__heading">Niche</h2>
                {isFacetsLoading ? (
                    <div className="product-niche-link">
                        <Skeleton className="h-3 w-3/5 rounded-none" />
                    </div>
                ) : facets.length > 0 ? (
                    <nav aria-label="Open the niche in Explore">
                        {facets.map(facet => (
                            <Link
                                className="product-niche-link"
                                key={nicheFacetKey(facet)}
                                to={nicheHref(facet)}
                            >
                                <Icon icon={nicheFacetIcon(facet.facet)} />
                                <span className="truncate">{nicheValueLabel(facet.name)}</span>
                                <span className="product-niche-link__category">
                                    {nicheCategoryLabel(facet.facet)}
                                </span>
                            </Link>
                        ))}
                    </nav>
                ) : (
                    <span className="text-muted">Not read yet</span>
                )}
            </section>
        </aside>
    );
};

const nicheHref = (facet: NicheFacet) =>
    `/explore?${new URLSearchParams({ niche: nicheFacetKey(facet) })}`;
