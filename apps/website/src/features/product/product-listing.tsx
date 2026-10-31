import { Button, Tooltip } from '@heroui/react';
import { Copy01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { daysSince, formatPrice } from '@/features/bsr/bsr-format';
import { KeyValue } from '@/features/shell/term-pane';
import type { ProductPageDetail } from './use-product-detail';

/**
 * The listing's properties as ruled key/value rows: value with a muted aside.
 * Every row always renders, an em dash standing in for a value not stored or
 * not loaded yet, so the sidebar keeps its height while the product loads; a
 * row remounts when its value lands rather than sliding its right-aligned
 * figure across.
 * The brand sits under the name. Type and Trademark from the product mock
 * have no data source yet.
 */
export const ProductListing = ({
    asin,
    priceTrend,
    product,
}: {
    /** Known from the URL before the product loads. */
    asin: string;
    priceTrend: { isLoading: boolean; label: string | null };
    product: ProductPageDetail | null;
}) => {
    const published = product?.dateFirstAvailable ?? null;
    const age = daysSince(published);
    const price = formatPrice(product?.keepa?.currentNewPrice);
    const category = product?.rootCategoryDisplayName ?? null;

    return (
        <dl className="key-values">
            <Property label="ASIN">
                <span className="font-mono" data-selectable-text>
                    {asin}
                </span>
                <Tooltip>
                    <Button
                        aria-label="Copy ASIN"
                        isIconOnly
                        onPress={() => copyText(asin)}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon icon={Copy01Icon} />
                    </Button>
                    <Tooltip.Content>Copy ASIN</Tooltip.Content>
                </Tooltip>
            </Property>
            <Property key={published ? 'published' : 'published-pending'} label="Published">
                {published ? (
                    <>
                        <span className="font-mono">{formatLongDate(published)}</span>
                        {age === null ? null : <Aside mono>{age}d</Aside>}
                    </>
                ) : (
                    <Missing />
                )}
            </Property>
            <Property
                key={price && !priceTrend.isLoading ? 'price' : 'price-pending'}
                label="Price"
            >
                {/* Price and its trend land together, so the right-aligned value never slides. */}
                {price && !priceTrend.isLoading ? (
                    <>
                        <span className="font-mono">{price}</span>
                        {priceTrend.label ? <Aside mono>{priceTrend.label}</Aside> : null}
                    </>
                ) : (
                    <Missing />
                )}
            </Property>
            <Property key={category ? 'category' : 'category-pending'} label="Category">
                {category ? <span className="truncate">{category}</span> : <Missing />}
            </Property>
        </dl>
    );
};

const Missing = () => <span className="text-muted">—</span>;

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
