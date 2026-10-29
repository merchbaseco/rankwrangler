import { Button, Link, Tooltip } from '@heroui/react';
import { Copy01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { daysSince, formatCount, formatPrice } from '@/features/bsr/bsr-format';
import { KeyValue } from '@/features/shell/term-pane';
import type { ProductPageDetail } from './use-product-detail';

/**
 * The listing's properties as ruled key/value rows: value with a muted aside.
 * Rows with nothing stored are left out; Type and Trademark from the product
 * mock have no data source yet.
 */
export const ProductListing = ({
    priceTrend,
    product,
}: {
    priceTrend: string | null;
    product: ProductPageDetail;
}) => {
    const age = daysSince(product.dateFirstAvailable);
    const price = formatPrice(product.keepa?.currentNewPrice);

    return (
        <dl className="key-values">
            <Property label="ASIN">
                <span className="font-mono" data-selectable-text>
                    {product.asin}
                </span>
                <Tooltip>
                    <Button
                        aria-label="Copy ASIN"
                        isIconOnly
                        onPress={() => copyText(product.asin)}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon icon={Copy01Icon} />
                    </Button>
                    <Tooltip.Content>Copy ASIN</Tooltip.Content>
                </Tooltip>
            </Property>
            {product.brand ? (
                <Property label="Brand">
                    <Link href={`/explore?${new URLSearchParams({ brand: product.brand })}`}>
                        <span data-selectable-text>{product.brand}</span>
                    </Link>
                    {product.brandDesignCount ? (
                        <Aside>
                            {formatCount(product.brandDesignCount)}{' '}
                            {product.brandDesignCount === 1 ? 'design' : 'designs'}
                        </Aside>
                    ) : null}
                </Property>
            ) : null}
            {product.dateFirstAvailable ? (
                <Property label="Published">
                    <span className="font-mono">{formatLongDate(product.dateFirstAvailable)}</span>
                    {age === null ? null : <Aside mono>{age}d</Aside>}
                </Property>
            ) : null}
            {price ? (
                <Property label="Price">
                    <span className="font-mono">{price}</span>
                    {priceTrend ? <Aside mono>{priceTrend}</Aside> : null}
                </Property>
            ) : null}
            {product.rootCategoryDisplayName ? (
                <Property label="Category">
                    <span className="truncate">{product.rootCategoryDisplayName}</span>
                </Property>
            ) : null}
        </dl>
    );
};

const Property = ({ children, label }: { children: ReactNode; label: string }) => (
    <KeyValue label={label}>
        <span className="flex min-w-0 items-center gap-x-1">{children}</span>
    </KeyValue>
);

const Aside = ({ children, mono = false }: { children: ReactNode; mono?: boolean }) => (
    <span className={mono ? 'shrink-0 font-mono text-muted' : 'shrink-0 text-muted'}>
        · {children}
    </span>
);

const formatLongDate = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
    }).format(new Date(iso));

const copyText = (value: string) => {
    navigator.clipboard.writeText(value).catch((error: unknown) => {
        console.error('Copy to clipboard failed', error);
    });
};
