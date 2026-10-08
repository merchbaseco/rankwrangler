import type { ProductGetManyInclude } from '@/api/public/product-input';
import type { ProductIdentity } from '@/db/product/get-products';
import { getStoredCutouts } from '@/db/product/product-cutout-thumbnail-store';
import { getStoredShortNames } from '@/db/product/product-short-name-store';
import type { ProductInfo } from '@/types';
import {
    prepareCutoutRequest,
    readStoredCutout,
    startProductCutoutGeneration,
} from './product-cutout-thumbnail';
import { type PublicCutoutThumbnail, toPublicCutoutThumbnail } from './product-read-model';
import { startProductShortNameGeneration } from './product-short-name';
import { prepareShortNameRequest, readStoredShortName } from './product-short-name-request';

export type BatchCutoutThumbnail = PublicCutoutThumbnail | { status: 'pending' };

/**
 * Batch listing enrichment. A requested field is final unless it is listed in `pending`;
 * a pending `shortName` is `null` and a pending `cutoutThumbnail` is `{ status: 'pending' }`.
 */
export interface ProductListingEnrichment {
    shortName?: string | null;
    cutoutThumbnail?: BatchCutoutThumbnail;
    pending: ProductGetManyInclude[];
}

export interface ProductListingEnrichmentSource {
    identity: ProductIdentity;
    product: Pick<ProductInfo, 'title' | 'thumbnail' | 'isMerchListing'> | null;
    listingActive: boolean;
}

export interface ProductListingEnrichmentDeps {
    getStoredShortNames: typeof getStoredShortNames;
    getStoredCutouts: typeof getStoredCutouts;
    startProductShortNameGeneration: typeof startProductShortNameGeneration;
    startProductCutoutGeneration: typeof startProductCutoutGeneration;
}

const defaultDeps: ProductListingEnrichmentDeps = {
    getStoredShortNames,
    getStoredCutouts,
    startProductShortNameGeneration,
    startProductCutoutGeneration,
};

/**
 * Reads stored short names and cutouts for a whole batch in one query each and never waits on
 * generation: a field whose generation has not finished is reported pending and its generation
 * starts in the background (deduplicated with any in-flight `get` for the same input).
 */
export const getProductListingEnrichments = async (
    {
        sources,
        include,
    }: { sources: readonly ProductListingEnrichmentSource[]; include: ProductGetManyInclude[] },
    deps: ProductListingEnrichmentDeps = defaultDeps
): Promise<ProductListingEnrichment[]> => {
    const [shortNames, cutouts] = await Promise.all([
        include.includes('shortName') ? resolveShortNames(sources, deps) : null,
        include.includes('cutoutThumbnail') ? resolveCutouts(sources, deps) : null,
    ]);

    return sources.map((_, index) => {
        const enrichment: ProductListingEnrichment = { pending: [] };
        const shortName = shortNames?.[index];
        if (shortName) {
            enrichment.shortName = shortName.pending ? null : shortName.value;
            if (shortName.pending) {
                enrichment.pending.push('shortName');
            }
        }
        const cutout = cutouts?.[index];
        if (cutout) {
            enrichment.cutoutThumbnail = cutout.pending
                ? { status: 'pending' }
                : toPublicCutoutThumbnail(cutout.value);
            if (cutout.pending) {
                enrichment.pending.push('cutoutThumbnail');
            }
        }
        return enrichment;
    });
};

type FieldResult<Value> = { pending: true } | { pending: false; value: Value };

const resolveShortNames = async (
    sources: readonly ProductListingEnrichmentSource[],
    deps: ProductListingEnrichmentDeps
): Promise<FieldResult<string | null>[]> => {
    const requests = sources.map(source =>
        source.listingActive && source.product?.isMerchListing === true
            ? prepareShortNameRequest({ ...source.identity, ...source.product })
            : null
    );
    const stored = await deps.getStoredShortNames(requests.filter(request => request !== null));
    return requests.map(request => {
        if (!request) {
            return { pending: false, value: null };
        }
        const row = readStoredShortName(
            stored.get(identityKey(request)) ?? null,
            request.inputFingerprint
        );
        if (row.state === 'missing') {
            deps.startProductShortNameGeneration(request);
            return { pending: true };
        }
        return { pending: false, value: row.state === 'ready' ? row.shortName : null };
    });
};

const resolveCutouts = async (
    sources: readonly ProductListingEnrichmentSource[],
    deps: ProductListingEnrichmentDeps
): Promise<FieldResult<string | null>[]> => {
    const requests = sources.map(source =>
        source.listingActive && source.product
            ? prepareCutoutRequest({ ...source.identity, thumbnail: source.product.thumbnail })
            : null
    );
    const stored = await deps.getStoredCutouts(requests.filter(request => request !== null));
    return requests.map(request => {
        if (!request) {
            return { pending: false, value: null };
        }
        const row = readStoredCutout(
            stored.get(identityKey(request)) ?? null,
            request.inputFingerprint
        );
        if (row.state === 'missing') {
            deps.startProductCutoutGeneration(request);
            return { pending: true };
        }
        return { pending: false, value: row.url };
    });
};

const identityKey = ({ marketplaceId, asin }: ProductIdentity) => `${marketplaceId}:${asin}`;
