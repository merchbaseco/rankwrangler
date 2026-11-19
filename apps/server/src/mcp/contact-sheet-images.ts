import { isAmazonImageUrl } from '@/utils/amazon-image-url';
import { type ContactSheet, composeContactSheet } from './contact-sheet';

export type FetchImage = (url: string, signal: AbortSignal) => Promise<Buffer | null>;

/**
 * A contact sheet of Product images by URL, in order. Only Amazon image URLs are fetched, at
 * most CONCURRENCY at a time, each within IMAGE_TIMEOUT_MS and all within TOTAL_TIMEOUT_MS; an
 * image that is missing, off the allowlist, slow or broken becomes an empty cell. Never throws:
 * a sheet that cannot be built is null, so it never fails the search it illustrates.
 */
export const buildContactSheet = async (
    imageUrls: ReadonlyArray<string | null>,
    fetchImage: FetchImage = fetchAmazonImage
): Promise<ContactSheet | null> => {
    try {
        const total = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
        const images: Array<Buffer | null> = imageUrls.map(() => null);
        let next = 0;
        const worker = async () => {
            while (next < imageUrls.length && !total.aborted) {
                const index = next;
                next += 1;
                const url = imageUrls[index];
                if (!url || !isAmazonImageUrl(url)) continue;
                const signal = AbortSignal.any([total, AbortSignal.timeout(IMAGE_TIMEOUT_MS)]);
                images[index] = await fetchImage(url, signal).catch(() => null);
            }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        return await composeContactSheet(images);
    } catch (error) {
        console.error('RankWrangler contact sheet failed.', {
            name: error instanceof Error ? error.name : 'UnknownError',
        });
        return null;
    }
};

const CONCURRENCY = 8;
const IMAGE_TIMEOUT_MS = 3_000;
const TOTAL_TIMEOUT_MS = 8_000;
const IMAGE_MAX_BYTES = 2_000_000;

const fetchAmazonImage: FetchImage = async (url, signal) => {
    const response = await fetch(url, { signal, redirect: 'error' });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= IMAGE_MAX_BYTES ? bytes : null;
};
