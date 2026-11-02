import { SyncPausedError } from '@/services/discovery-types';
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
    log: (message: string) => void;
}

/**
 * Re-fetches up to `limit` stored listings in SP-API batches and writes them back through the
 * Product upsert, where the latest verdict wins: fresh evidence promotes and demotes alike. A dry
 * run fetches and tallies without writing. Transition keys read `before->after`; a listing SP-API
 * didn't return is `missing` and keeps its stored status. A paused sync stops the run before the
 * batch it interrupted, so `lastAsin` is where the next run resumes.
 */
export const reclassifyMerchListings = async (
    input: { afterAsin: string; limit: number; dryRun: boolean },
    deps: MerchReclassificationDeps
) => {
    const transitions = new Map<string, number>();
    let afterAsin = input.afterAsin;
    let checked = 0;
    let exhausted = false;
    let paused = false;
    while (checked < input.limit) {
        const size = Math.min(MERCH_RECLASSIFICATION_BATCH_SIZE, input.limit - checked);
        const stored = await deps.readBatch(afterAsin, size);
        let fetched: SpApiProduct[] = [];
        if (stored.length) {
            try {
                fetched = await deps.fetchProducts(stored.map(row => row.asin));
            } catch (error) {
                if (!(error instanceof SyncPausedError)) throw error;
                paused = true;
                break;
            }
        }
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
        if (stored.length) afterAsin = stored[stored.length - 1].asin;
        if (stored.length < size) {
            exhausted = true;
            break;
        }
    }
    deps.log(`checked ${checked} through ${afterAsin}${paused ? '; sync paused' : ''}`);
    return {
        checked,
        lastAsin: afterAsin,
        exhausted,
        paused,
        transitions: Object.fromEntries(transitions),
    };
};

const label = (isMerchListing: boolean) => (isMerchListing ? 'merch' : 'nonMerch');
