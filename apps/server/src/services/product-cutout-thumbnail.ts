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
import { createEventLogSafe } from './event-logs';
import {
    createCutoutObject,
    getCutoutPublicUrl,
    isCutoutSourceSupported,
} from './product-cutout-thumbnail-media';
import { coordinateRetrieval, startDetachedRetrieval } from './retrieval-coordinator';

const CALLER_TIMEOUT_MS = 24_000;
const POLL_MS = 250;
export const CUTOUT_GENERATOR_VERSION = 'foreground-alpha-normalized-128:v3';

export type CutoutRequest = CutoutIdentity & {
    sourceUrl: string;
    inputFingerprint: string;
};
type CutoutSource = CutoutIdentity & { thumbnail: ProductThumbnail };
type StoredCutout = NonNullable<Awaited<ReturnType<typeof getStoredCutout>>>;

const cutoutRetrievalKey = ({ marketplaceId, asin, inputFingerprint }: CutoutRequest) =>
    `product-cutout:${marketplaceId}:${asin}:${inputFingerprint}`;

export const getProductCutoutThumbnail = async ({
    signal,
    ...source
}: CutoutSource & { signal?: AbortSignal }): Promise<string | null> => {
    const request = prepareCutoutRequest(source);
    if (!request) {
        return null;
    }
    try {
        return await coordinateRetrieval({
            key: cutoutRetrievalKey(request),
            signal,
            timeoutMs: CALLER_TIMEOUT_MS,
            work: () => resolveCutout(request),
        });
    } catch (error) {
        console.error('[Product Cutout] Could not resolve cutout thumbnail:', error);
        return null;
    }
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
        const claimId = randomUUID();
        if (
            await claimCutoutGeneration({
                ...identity,
                inputFingerprint: request.inputFingerprint,
                claimId,
            })
        ) {
            return await generateClaimedCutout(request, claimId);
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
