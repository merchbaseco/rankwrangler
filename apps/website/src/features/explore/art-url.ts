/** Longest-side pixels per rendition: grid and row thumbnails, and the preview and hero art. */
const RENDITION_PX = { thumb: 160, large: 640 } as const;

export type ArtRendition = keyof typeof RENDITION_PX;

const AMAZON_IMAGE = /^\/images\/I\/([^/.]+)(?:\.[^/]*?)?\.(jpe?g|png|gif|webp)$/i;

/**
 * Amazon's image CDN serves any size of a listing photo from the same id (`._SL160_`); the stored
 * URL is the full-size original (often 2000px and 150KB+), so art asks for the rendition its box
 * needs. Two shared sizes keep the browser cache warm across screens. Other URLs (stored cutouts,
 * already 512px) pass through.
 */
export const artUrl = (src: string, rendition: ArtRendition) => {
    try {
        const url = new URL(src);
        const match = url.hostname === 'm.media-amazon.com' && AMAZON_IMAGE.exec(url.pathname);
        if (!match) return src;
        url.pathname = `/images/I/${match[1]}._SL${RENDITION_PX[rendition]}_.${match[2]}`;
        return url.toString();
    } catch {
        return src;
    }
};
