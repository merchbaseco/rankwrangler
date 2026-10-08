import { createHash } from 'node:crypto';
import {
    type getStoredShortName,
    SHORT_NAME_ERROR_RETRY_MS,
} from '@/db/product/product-short-name-store';
import type { ProductThumbnail } from '@/types';
import { buildShortNameCandidates } from './product-short-name-candidates';

export const SHORT_NAME_GENERATOR_VERSION = 'gemini-3.1-flash-lite-low+jev-1.13.0:v2';

/** Returns null when the Product has nothing to name; the short name is then final `null`. */
export const prepareShortNameRequest = ({
    marketplaceId,
    asin,
    title,
    thumbnail,
}: ShortNameSource): ShortNameRequest | null => {
    if (!title?.trim() || thumbnail.status !== 'available') {
        return null;
    }
    const candidates = buildShortNameCandidates(title);
    if (candidates.length === 0) {
        return null;
    }
    return {
        marketplaceId,
        asin,
        title,
        imageUrl: thumbnail.url,
        candidates,
        inputFingerprint: getShortNameInputFingerprint(title, thumbnail.url),
    };
};

/**
 * Classifies a stored row for the current input. `failed` means generation failed within the
 * retry window; `missing` means generation has not finished for this input.
 */
export const readStoredShortName = (
    stored: StoredShortName | null,
    inputFingerprint: string
): { state: 'ready'; shortName: string | null } | { state: 'failed' } | { state: 'missing' } => {
    if (stored?.inputFingerprint !== inputFingerprint) {
        return { state: 'missing' };
    }
    if (stored.state === 'ready') {
        return { state: 'ready', shortName: stored.shortName };
    }
    if (
        stored.state === 'error' &&
        Date.now() - stored.attemptedAt.getTime() < SHORT_NAME_ERROR_RETRY_MS
    ) {
        return { state: 'failed' };
    }
    return { state: 'missing' };
};

export interface ShortNameSource {
    marketplaceId: string;
    asin: string;
    title: string | null;
    thumbnail: ProductThumbnail;
}

export interface ShortNameRequest {
    marketplaceId: string;
    asin: string;
    title: string;
    imageUrl: string;
    candidates: string[];
    inputFingerprint: string;
}

export type StoredShortName = NonNullable<Awaited<ReturnType<typeof getStoredShortName>>>;

export const shortNameRetrievalKey = ({
    marketplaceId,
    asin,
    inputFingerprint,
}: ShortNameRequest) => `product-short-name:${marketplaceId}:${asin}:${inputFingerprint}`;

export const getShortNameInputFingerprint = (title: string, imageUrl: string) =>
    createHash('md5')
        .update(
            `${Buffer.byteLength(title, 'utf8')}:${title}${Buffer.byteLength(imageUrl, 'utf8')}:${imageUrl}${SHORT_NAME_GENERATOR_VERSION}`
        )
        .digest('hex');
