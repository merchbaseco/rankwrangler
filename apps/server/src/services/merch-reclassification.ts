import { CatalogCapacityDeferredError } from '@/services/discovery-types';
import type { SpApiProduct } from '@/types';

export const MERCH_RECLASSIFICATION_BATCH_SIZE = 20;

type MerchKnowledge = boolean | null;

export interface StoredMerchListing {
    asin: string;
    isMerchListing: MerchKnowledge;
}

export interface MerchReclassificationDeps {
    readBatch: (afterAsin: string, limit: number) => Promise<StoredMerchListing[]>;
    fetchProducts: (asins: string[]) => Promise<SpApiProduct[]>;
    writeProducts: (products: SpApiProduct[]) => Promise<void>;
    demoteProducts: (asins: string[]) => Promise<void>;
    sleep: (ms: number) => Promise<void>;
    log: (message: string) => void;
}

/**
 * Re-fetches stored listings in SP-API batches and reclassifies them with the current Merch
 * classifier. Writes go through the Product upsert, so stored `true` is never downgraded and new
 * Merch evidence upgrades `false` or `null`. With `demote`, stored Merch that fresh evidence now
 * classifies non-Merch is explicitly cleared: the upsert alone never downgrades, so this is how a
 * tightened classifier undoes earlier false positives. A dry run fetches and tallies without
 * writing. Transition keys read `before->after`.
 */
export const reclassifyMerchListings = async (
    input: { afterAsin: string; limit: number | null; dryRun: boolean; demote?: boolean },
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
        const demoted: string[] = [];
        for (const row of stored) {
            const product = byAsin.get(row.asin);
            const demote = input.demote && row.isMerchListing === true && product?.isMerchListing === false;
            if (demote) demoted.push(row.asin);
            const after = demote ? false : reconciled(row.isMerchListing, product?.isMerchListing ?? null);
            const key = product
                ? `${label(row.isMerchListing)}->${label(after)}`
                : `${label(row.isMerchListing)}->missing`;
            transitions.set(key, (transitions.get(key) ?? 0) + 1);
        }
        if (!input.dryRun && fetched.length) await deps.writeProducts(fetched);
        if (demoted.length) deps.log(`${input.dryRun ? 'would demote' : 'demoted'} ${demoted.join(',')}`);
        if (!input.dryRun && demoted.length) await deps.demoteProducts(demoted);
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

// Mirrors `reconcileMerchListing`: true is monotonic and unknown evidence keeps stored knowledge.
const reconciled = (stored: MerchKnowledge, incoming: MerchKnowledge): MerchKnowledge => {
    if (stored === true || incoming === true) return true;
    return incoming === null ? stored : false;
};

const label = (value: MerchKnowledge) => {
    if (value === null) return 'unknown';
    return value ? 'merch' : 'nonMerch';
};
