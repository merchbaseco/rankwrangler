import { cn } from '@/lib/utils';
import { artUrl } from './art-url';

/**
 * A design's art on the sunken well, at row size (20px), a grid row's density
 * size (40px comfortable, 20px compact), the detail size or the Product
 * page's full width. `crop="print"` (the default for 20px rows) zooms toward
 * the chest print; `crop="garment"` (the default elsewhere, Grid J) shows the
 * whole shirt. In a grid row, Amazon's white photo (no cutout yet) sits on an
 * inset light tile so the white reads as intentional on graphite (OptsL
 * thumbnails); a cutout sits straight on the well. An empty well holds the
 * place without art.
 */
export const ProductThumb = ({
    alt = '',
    crop,
    isCutout = false,
    size = 'row',
    src,
}: {
    alt?: string;
    crop?: 'print' | 'garment';
    isCutout?: boolean;
    size?: 'row' | 'grid' | 'detail' | 'hero';
    src: string | null;
}) => {
    const resolvedCrop = crop ?? (size === 'row' ? 'print' : 'garment');
    const rendition = size === 'row' || size === 'grid' ? 'thumb' : 'large';
    const image = src ? (
        <img
            alt={alt}
            decoding="async"
            draggable={false}
            loading="lazy"
            src={artUrl(src, rendition)}
        />
    ) : null;
    return (
        <span
            className={cn(
                'product-thumb',
                `product-thumb--${size}`,
                resolvedCrop === 'print' &&
                    (isCutout ? 'product-thumb--print-cutout' : 'product-thumb--print')
            )}
        >
            {image && size === 'grid' && !isCutout ? (
                <span className="product-thumb__tile">{image}</span>
            ) : (
                image
            )}
        </span>
    );
};

/** The cutout when one is stored, else Amazon's thumbnail. */
export const productArtUrl = (product: {
    cutoutThumbnailUrl?: string | null;
    thumbnail?: { status: string; url?: string | null } | null;
}) =>
    product.cutoutThumbnailUrl ??
    (product.thumbnail?.status === 'available' ? (product.thumbnail.url ?? null) : null);

/** Whether the art `productArtUrl` picks is a background-removed cutout. */
export const hasCutoutArt = (product: { cutoutThumbnailUrl?: string | null }) =>
    Boolean(product.cutoutThumbnailUrl);
