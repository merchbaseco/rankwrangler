import { createHash, randomUUID } from 'node:crypto';
import {
    CUTOUT_ERROR_RETRY_MS,
    type CutoutIdentity,
    claimCutoutGeneration,
    failCutoutGeneration,
    finishCutoutGeneration,
    getStoredCutout,
    isCurrentCutoutSource,
} from '@/db/product/product-cutout-thumbnail-store';
import type { ProductThumbnail } from '@/types';
import { createConcurrencyLimit } from './concurrency-limit';
import { createEventLogSafe } from './event-logs';
import {
    createCutoutObject,
    getCutoutPublicUrl,
    isCutoutSourceSupported,
} from './product-cutout-thumbnail-media';
import { waitForProductEnrichment } from './product-enrichment-wait';
import { startDetachedRetrieval } from './retrieval-coordinator';

const POLL_MS = 250;
/**
 * Process-wide cap on cutout generations (one Cloudflare foreground-segmentation transform + one
 * R2 put each). Cloudflare publishes no per-zone transform concurrency limit, but segmentation is
 * the slowest enrichment step (~3s), each job buffers and re-encodes an image, and a job claims
 * its row only once it holds a slot, so queueing never burns the 45s claim lease. Six clears a
 * typical 10-chip message in two ~3.5s waves.
 */
export const CUTOUT_GENERATION_CONCURRENCY = 6;
const generationSlots = createConcurrencyLimit(CUTOUT_GENERATION_CONCURRENCY);
export const CUTOUT_GENERATOR_VERSION = 'foreground-alpha-normalized-128:v3';

export type CutoutRequest = CutoutIdentity & {
    sourceUrl: string;
    inputFingerprint: string;
};
type CutoutSource = CutoutIdentity & { thumbnail: ProductThumbnail };
type StoredCutout = NonNullable<Awaited<ReturnType<typeof getStoredCutout>>>;

const cutoutRetrievalKey = ({ marketplaceId, asin, inputFingerprint }: CutoutRequest) =>
    `product-cutout:${marketplaceId}:${asin}:${inputFingerprint}`;

/**
 * Waits up to `timeoutMs` for the cutout URL. Slow or failed generation settles as `null` for
 * this response; generation keeps running so a later request reads the finished value.
 */
export const getProductCutoutThumbnail = async ({
    signal,
    timeoutMs,
    ...source
}: CutoutSource & { signal?: AbortSignal; timeoutMs: number }): Promise<string | null> => {
    const request = prepareCutoutRequest(source);
    if (!request) {
        return null;
    }
    return await waitForProductEnrichment({
        key: cutoutRetrievalKey(request),
        signal,
        timeoutMs,
        label: 'Product Cutout',
        work: () => resolveCutout(request),
    });
};

/** Returns null when the Product has no cutout source; the cutout is then final unavailable. */
export const prepareCutoutRequest = ({
    marketplaceId,
    asin,
    thumbnail,
}: CutoutSource): CutoutRequest | null => {
    if (thumbnail.status !== 'available' || !isCutoutSourceSupported(thumbnail.url)) {
        return null;
    }
    return {
        marketplaceId,
        asin,
        sourceUrl: thumbnail.url,
        inputFingerprint: getCutoutInputFingerprint(thumbnail.url),
    };
};

/**
 * Classifies a stored row for the current source. `ready` with a null URL means generation
 * failed within the retry window; `missing` means generation has not finished for this source.
 */
export const readStoredCutout = (
    stored: StoredCutout | null,
    inputFingerprint: string
): { state: 'ready'; url: string | null } | { state: 'missing' } => {
    if (stored?.inputFingerprint !== inputFingerprint) {
        return { state: 'missing' };
    }
    if (stored.state === 'ready' && stored.objectKey) {
        return { state: 'ready', url: getCutoutPublicUrl(stored.objectKey) };
    }
    if (
        stored.state === 'error' &&
        Date.now() - stored.attemptedAt.getTime() < CUTOUT_ERROR_RETRY_MS
    ) {
        return { state: 'ready', url: null };
    }
    return { state: 'missing' };
};

/** Starts or joins generation without waiting; the same key `get` callers wait on. */
export const startProductCutoutGeneration = (request: CutoutRequest) =>
    startDetachedRetrieval({
        key: cutoutRetrievalKey(request),
        work: () => resolveCutout(request),
        onError: error => {
            console.error('[Product Cutout] Background generation failed:', error);
        },
    });

export const getCutoutInputFingerprint = (sourceUrl: string) =>
    createHash('md5')
        .update(`${Buffer.byteLength(sourceUrl, 'utf8')}:${sourceUrl}${CUTOUT_GENERATOR_VERSION}`)
        .digest('hex');

export const getCutoutObjectKey = ({
    marketplaceId,
    asin,
    inputFingerprint,
}: CutoutIdentity & { inputFingerprint: string }) =>
    `cutouts/${encodeURIComponent(marketplaceId)}/${encodeURIComponent(asin)}/${inputFingerprint}.webp`;

const resolveCutout = async (request: CutoutRequest): Promise<string | null> => {
    const identity = { marketplaceId: request.marketplaceId, asin: request.asin };
    while (true) {
        if (!(await isCurrentCutoutSource({ ...identity, sourceUrl: request.sourceUrl }))) {
            return null;
        }
        const stored = readStoredCutout(await getStoredCutout(identity), request.inputFingerprint);
        if (stored.state === 'ready') {
            return stored.url;
        }
        const result = await generationSlots.run(async () => {
            const claimId = randomUUID();
            const claimed = await claimCutoutGeneration({
                ...identity,
                inputFingerprint: request.inputFingerprint,
                claimId,
            });
            return claimed
                ? { claimed, url: await generateClaimedCutout(request, claimId) }
                : { claimed, url: null };
        });
        if (result.claimed) {
            return result.url;
        }
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
    }
};

const generateClaimedCutout = async (
    request: CutoutRequest,
    claimId: string
): Promise<string | null> => {
    const { marketplaceId, asin, sourceUrl, inputFingerprint } = request;
    const identity = { marketplaceId, asin };
    const objectKey = getCutoutObjectKey(request);
    try {
        const bytes = await createCutoutObject({ sourceUrl, objectKey });
        const saved = await finishCutoutGeneration({ ...identity, claimId, sourceUrl, objectKey });
        if (!saved) {
            return null;
        }
        await createEventLogSafe({
            level: 'info',
            status: 'success',
            category: 'product',
            action: 'product.cutoutThumbnail.generate',
            primitiveType: 'product',
            message: `Generated cutout thumbnail for ${asin}.`,
            marketplaceId,
            asin,
            detailsJson: { bytes, inputFingerprint },
        });
        return getCutoutPublicUrl(objectKey);
    } catch (error) {
        await failCutoutGeneration({ ...identity, claimId });
        await createEventLogSafe({
            level: 'error',
            status: 'failed',
            category: 'product',
            action: 'product.cutoutThumbnail.generate',
            primitiveType: 'product',
            message: `Cutout thumbnail generation failed for ${asin}.`,
            marketplaceId,
            asin,
            detailsJson: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
        return null;
    }
};
