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
import { coordinateRetrieval } from './retrieval-coordinator';

const CALLER_TIMEOUT_MS = 24_000;
const POLL_MS = 250;
export const CUTOUT_GENERATOR_VERSION = 'foreground-alpha-normalized-128:v3';

type CutoutRequest = CutoutIdentity & {
    sourceUrl: string;
    inputFingerprint: string;
};

export const getProductCutoutThumbnail = async ({
    marketplaceId,
    asin,
    thumbnail,
    signal,
}: CutoutIdentity & { thumbnail: ProductThumbnail; signal?: AbortSignal }): Promise<
    string | null
> => {
    if (thumbnail.status !== 'available' || !isCutoutSourceSupported(thumbnail.url)) {
        return null;
    }
    const sourceUrl = thumbnail.url;
    const inputFingerprint = getCutoutInputFingerprint(sourceUrl);
    try {
        return await coordinateRetrieval({
            key: `product-cutout:${marketplaceId}:${asin}:${inputFingerprint}`,
            signal,
            timeoutMs: CALLER_TIMEOUT_MS,
            work: () => resolveCutout({ marketplaceId, asin, sourceUrl, inputFingerprint }),
        });
    } catch (error) {
        console.error('[Product Cutout] Could not resolve cutout thumbnail:', error);
        return null;
    }
};

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
        const stored = await getStoredCutout(identity);
        if (
            stored?.inputFingerprint === request.inputFingerprint &&
            stored.state === 'ready' &&
            stored.objectKey
        ) {
            return getCutoutPublicUrl(stored.objectKey);
        }
        if (
            stored?.inputFingerprint === request.inputFingerprint &&
            stored.state === 'error' &&
            Date.now() - stored.attemptedAt.getTime() < CUTOUT_ERROR_RETRY_MS
        ) {
            return null;
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
