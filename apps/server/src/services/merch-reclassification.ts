import { CatalogCapacityDeferredError } from '@/services/discovery-types';
import type { SpApiProduct } from '@/types';

export const MERCH_RECLASSIFICATION_BATCH_SIZE = 20;

export interface StoredMerchListing {
    asin: string;
    isMerchListing: boolean;
}

export interface MerchReclassificationDeps {
    readBatch: (afterAsin: string, limit: number) => Promise<StoredMerchListing[]>;
    fetchProducts: (asins: string[]) => Promise<SpApiProduct[]>;
    writeProducts: (products: SpApiProduct[]) => Promise<void>;
    sleep: (ms: number) => Promise<void>;
    log: (message: string) => void;
}

/**
 * Re-fetches stored listings in SP-API batches and writes them back through the Product upsert,
 * where the latest verdict wins: fresh evidence promotes and demotes alike. A dry run fetches and
 * tallies without writing. Transition keys read `before->after`; a listing SP-API didn't return
 * is `missing` and keeps its stored status.
 */
export const reclassifyMerchListings = async (
    input: { afterAsin: string; limit: number | null; dryRun: boolean },
    deps: MerchReclassificationDeps
) => {
    const transitions = new Map<string, number>();
    let afterAsin = input.afterAsin;
    let checked = 0;
    while (input.limit === null || checked < input.limit) {
        const size = Math.min(
            MERCH_RECLASSIFICATION_BATCH_SIZE,
            (input.limit ?? Number.POSITIVE_INFINITY) - checked
        );
        const stored = await deps.readBatch(afterAsin, size);
        if (!stored.length) break;
        const fetched = await fetchWithBackgroundCapacity(
            stored.map(row => row.asin),
            deps
        );
        const byAsin = new Map(fetched.map(product => [product.asin, product]));
        const changed = new Map<string, string[]>();
        for (const row of stored) {
            const product = byAsin.get(row.asin);
            const after = product ? label(product.isMerchListing) : 'missing';
            const key = `${label(row.isMerchListing)}->${after}`;
            transitions.set(key, (transitions.get(key) ?? 0) + 1);
            if (product && product.isMerchListing !== row.isMerchListing) {
                changed.set(key, [...(changed.get(key) ?? []), row.asin]);
            }
        }
        if (!input.dryRun && fetched.length) await deps.writeProducts(fetched);
        for (const [key, asins] of changed) {
            deps.log(`${input.dryRun ? 'would change' : 'changed'} ${key}: ${asins.join(',')}`);
        }
        checked += stored.length;
        afterAsin = stored[stored.length - 1].asin;
        deps.log(`checked ${checked} through ${afterAsin}`);
    }
    return { checked, lastAsin: afterAsin, transitions: Object.fromEntries(transitions) };
};

const fetchWithBackgroundCapacity = async (asins: string[], deps: MerchReclassificationDeps) => {
    while (true) {
        try {
            return await deps.fetchProducts(asins);
        } catch (error) {
            if (!(error instanceof CatalogCapacityDeferredError)) throw error;
            const waitMs = Math.max(1000, error.retryAt.getTime() - Date.now());
            deps.log(`background capacity deferred (${error.reason}); waiting ${waitMs}ms`);
            await deps.sleep(waitMs);
        }
    }
};

const label = (isMerchListing: boolean) => (isMerchListing ? 'merch' : 'nonMerch');
