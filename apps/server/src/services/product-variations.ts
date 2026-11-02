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
import { waitForProductEnrichment } from './product-enrichment-wait';
import {
    clearVariationDiscoveryCachesForTests,
    discoverVariationRole,
    type VariationDeps,
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
    variationsRetrievalKey,
} from './product-variations-request';

export type { ProductVariations, VariationRequest } from './product-variations-request';
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
): Promise<ProductVariations | null> =>
    await waitForProductEnrichment({
        key: variationsRetrievalKey(request),
        signal: request.signal,
        timeoutMs: request.timeoutMs,
        label: 'Product Variations',
        work: () => resolveVariations(request, deps),
    });

const resolveVariations = async (
    request: VariationRequest,
    deps: VariationDeps
): Promise<ProductVariations | null> => {
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
            return classified.value;
        }
        if (classified.state === 'failed') {
            return null;
        }
        knownParent ??= classified.parentAsin;

        if (knownParent === null) {
            const discovery = await discoverVariationRole(marketplaceId, requestedAsin, deps);
            if (discovery.kind === 'unavailable') {
                return null;
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
                    return null;
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
            return result.value;
        }
        if (result.kind === 'none' || result.kind === 'aborted') {
            return null;
        }

        const parentRow = await getStoredVariation({ marketplaceId, parentAsin });
        if (readyFamilyOmitsMember(parentRow, requestedAsin) && parentRow.fetchedAt) {
            const ageMs = Date.now() - parentRow.fetchedAt.getTime();
            if (ageMs < VARIATIONS_MEMBER_REFRESH_MS || memberRefreshAttempted) {
                return null;
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
                return null;
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
            return refreshed.kind === 'ready' ? refreshed.value : null;
        }

        await sleep(POLL_MS);
    }
    return null;
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
