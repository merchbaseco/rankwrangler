import { randomUUID } from 'node:crypto';
import {
    claimVariationFetch,
    finishVariationFetch,
    getStoredVariation,
    lookupVariationsByMember,
    VARIATIONS_MEMBER_REFRESH_MS,
} from '@/db/product/product-variation-store';
import { createSpApiProvider } from '@/services/providers/sp-api/sp-api-provider';
import { createConcurrencyLimit } from './concurrency-limit';
import {
    clearVariationDiscoveryCachesForTests,
    discoverVariationRole,
    type VariationDeps,
    VARIATIONS_DISCOVERY_ERROR_COOLDOWN_MS,
} from './product-variations-discovery';
import {
    fetchClaimedVariationFamily,
    VARIATIONS_FAMILY_FETCH_DEADLINE_MS,
} from './product-variations-fetch';
import type { VariationRole } from './product-variations-parse';
import {
    classifyStoredVariations,
    type ProductVariations,
    type VariationRequest,
    type VariationsOutcome,
    variationsRetrievalKey,
} from './product-variations-request';
import {
    coordinateRetrieval,
    RETRIEVAL_DEFAULT_RETRY_AFTER_SECONDS,
    RetrievalRetryableError,
} from './retrieval-coordinator';

export type { ProductVariations, VariationRequest } from './product-variations-request';
export type { ProductVariationsStatus, VariationsOutcome } from './product-variations-request';
export { toPublicVariationsFields } from './product-variations-request';
export type { VariationDeps } from './product-variations-discovery';
export { clearVariationDiscoveryCachesForTests };
export { VARIATIONS_FAMILY_FETCH_DEADLINE_MS };

const POLL_MS = 250;
/** Extra wall time after the caller enrichment budget for one in-flight Catalog fetch. */
export const VARIATIONS_RESOLVE_GRACE_MS = 30_000;
export const VARIATIONS_FETCH_CONCURRENCY = 2;
const fetchSlots = createConcurrencyLimit(VARIATIONS_FETCH_CONCURRENCY);

const defaultDeps: VariationDeps = {
    searchCatalogItemsByAsins: (...args) =>
        createSpApiProvider().searchCatalogItemsByAsins(...args),
};

export const getProductVariations = async (
    request: VariationRequest,
    deps: VariationDeps = defaultDeps
): Promise<VariationsOutcome> => {
    try {
        return await coordinateRetrieval({
            key: variationsRetrievalKey(request),
            work: () => resolveVariations(request, deps),
            signal: request.signal,
            timeoutMs: request.timeoutMs,
        });
    } catch (error) {
        if (error instanceof RetrievalRetryableError) {
            if (error.reason === 'caller_detached') {
                throw error;
            }
            return { status: 'pending', retryAfterSeconds: error.retryAfterSeconds };
        }
        console.error('[Product Variations] Enrichment unavailable for this response:', error);
        return { status: 'failed', retryAfterSeconds: RETRIEVAL_DEFAULT_RETRY_AFTER_SECONDS };
    }
};

const resolveVariations = async (
    request: VariationRequest,
    deps: VariationDeps
): Promise<VariationsOutcome> => {
    const marketplaceId = request.marketplaceId;
    const requestedAsin = request.asin.toUpperCase();
    const hardDeadline = Date.now() + request.timeoutMs + VARIATIONS_RESOLVE_GRACE_MS;
    let knownParent: string | null = null;
    let discovered: VariationRole | null = null;
    let memberRefreshAttempted = false;

    while (Date.now() < hardDeadline) {
        const classified = classifyStoredVariations(
            await lookupVariationsByMember(marketplaceId, requestedAsin),
            requestedAsin
        );
        if (classified.state === 'ready') {
            return classified.value === null
                ? { status: 'none' }
                : { status: 'ready', value: classified.value };
        }
        if (classified.state === 'failed') {
            return { status: 'failed', retryAfterSeconds: classified.retryAfterSeconds };
        }
        knownParent ??= classified.parentAsin;

        if (knownParent === null) {
            const discovery = await discoverVariationRole(marketplaceId, requestedAsin, deps);
            if (discovery.kind === 'unavailable') {
                return {
                    status: 'failed',
                    retryAfterSeconds: Math.ceil(VARIATIONS_DISCOVERY_ERROR_COOLDOWN_MS / 1000),
                };
            }
            discovered = discovery;
            if (discovered.kind === 'none') {
                const claimId = randomUUID();
                const claimed = await claimVariationFetch({
                    marketplaceId,
                    parentAsin: requestedAsin,
                    claimId,
                });
                if (claimed) {
                    await finishVariationFetch({
                        marketplaceId,
                        parentAsin: requestedAsin,
                        claimId,
                        resolution: { kind: 'none' },
                    });
                    return { status: 'none' };
                }
                await sleep(POLL_MS);
                continue;
            }
            knownParent = discovered.parentAsin;
        }

        const parentAsin = knownParent;
        const result = await fetchSlots.run(async () => {
            const claimId = randomUUID();
            if (!(await claimVariationFetch({ marketplaceId, parentAsin, claimId }))) {
                return { kind: 'claimed-elsewhere' } as const;
            }
            return await fetchClaimedVariationFamily({
                marketplaceId,
                parentAsin,
                claimId,
                seed: discovered?.kind === 'parent' ? discovered : null,
                deps,
                signal: familyFetchDeadlineSignal(),
            });
        });

        if (result.kind === 'ready') {
            return { status: 'ready', value: result.value };
        }
        if (result.kind === 'none') {
            return { status: 'none' };
        }
        if (result.kind === 'aborted') {
            return { status: 'pending', retryAfterSeconds: RETRIEVAL_DEFAULT_RETRY_AFTER_SECONDS };
        }

        const parentRow = await getStoredVariation({ marketplaceId, parentAsin });
        if (readyFamilyOmitsMember(parentRow, requestedAsin) && parentRow.fetchedAt) {
            const ageMs = Date.now() - parentRow.fetchedAt.getTime();
            if (ageMs < VARIATIONS_MEMBER_REFRESH_MS || memberRefreshAttempted) {
                return { status: 'none' };
            }
            memberRefreshAttempted = true;
            const claimId = randomUUID();
            const claimed = await claimVariationFetch({
                marketplaceId,
                parentAsin,
                claimId,
                allowMemberRefresh: true,
            });
            if (!claimed) {
                return {
                    status: 'pending',
                    retryAfterSeconds: RETRIEVAL_DEFAULT_RETRY_AFTER_SECONDS,
                };
            }
            const refreshed = await fetchSlots.run(() =>
                fetchClaimedVariationFamily({
                    marketplaceId,
                    parentAsin,
                    claimId,
                    seed: null,
                    deps,
                    signal: familyFetchDeadlineSignal(),
                })
            );
            if (refreshed.kind === 'ready') {
                return { status: 'ready', value: refreshed.value };
            }
            if (refreshed.kind === 'none') {
                return { status: 'none' };
            }
            return { status: 'pending', retryAfterSeconds: RETRIEVAL_DEFAULT_RETRY_AFTER_SECONDS };
        }

        await sleep(POLL_MS);
    }
    return { status: 'pending', retryAfterSeconds: RETRIEVAL_DEFAULT_RETRY_AFTER_SECONDS };
};

/** Shared fetch budget only — never wired to the caller's request AbortSignal. */
const familyFetchDeadlineSignal = () => AbortSignal.timeout(VARIATIONS_FAMILY_FETCH_DEADLINE_MS);

const readyFamilyOmitsMember = (
    row: Awaited<ReturnType<typeof getStoredVariation>>,
    requestedAsin: string
): row is NonNullable<typeof row> & { fetchedAt: Date } =>
    row !== null &&
    row.state === 'ready' &&
    row.kind === 'family' &&
    row.fetchedAt !== null &&
    !row.memberAsins.includes(requestedAsin.toUpperCase());

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
