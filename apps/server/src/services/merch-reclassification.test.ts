import { describe, expect, it } from 'bun:test';
import { CatalogCapacityDeferredError } from '@/services/discovery-types';
import {
    reclassifyMerchListings,
    type StoredMerchListing,
} from '@/services/merch-reclassification';
import type { SpApiProduct } from '@/types';

const stored: StoredMerchListing[] = [
    { asin: 'B0TST00001', isMerchListing: false },
    { asin: 'B0TST00002', isMerchListing: null },
    { asin: 'B0TST00003', isMerchListing: false },
    { asin: 'B0TST00004', isMerchListing: true },
    { asin: 'B0TST00005', isMerchListing: null },
];

const fetched = (asin: string, isMerchListing: boolean | null): SpApiProduct => ({
    asin,
    marketplaceId: 'ATVPDKIKX0DER',
    dateFirstAvailable: null,
    title: null,
    brand: null,
    isMerchListing,
    bullet1: null,
    bullet2: null,
    rootCategoryId: null,
    rootCategoryBsr: null,
    thumbnailUrl: null,
    keepa: null,
    fetchedAt: '2026-10-28T12:00:00.000Z',
});

const harness = (options: { deferFirst?: boolean } = {}) => {
    const writes: SpApiProduct[][] = [];
    const sleeps: number[] = [];
    const reads: Array<[string, number]> = [];
    let deferred = options.deferFirst ?? false;
    return {
        writes,
        sleeps,
        reads,
        deps: {
            readBatch: async (after: string, limit: number) => {
                reads.push([after, limit]);
                return stored.filter(row => row.asin > after).slice(0, Math.min(limit, 2));
            },
            fetchProducts: async (asins: string[]) => {
                if (deferred) {
                    deferred = false;
                    throw new CatalogCapacityDeferredError('rate', new Date(Date.now() + 5_000));
                }
                const answers: Record<string, boolean | null> = {
                    B0TST00001: true,
                    B0TST00002: false,
                    B0TST00003: false,
                    B0TST00004: false,
                };
                return asins
                    .filter(asin => asin in answers)
                    .map(asin => fetched(asin, answers[asin]));
            },
            writeProducts: async (products: SpApiProduct[]) => {
                writes.push(products);
            },
            sleep: async (ms: number) => {
                sleeps.push(ms);
            },
            log: () => {},
        },
    };
};

describe('reclassifyMerchListings', () => {
    it('tallies reconciled flips without writing on a dry run', async () => {
        const run = harness();
        const result = await reclassifyMerchListings(
            { afterAsin: '', limit: null, dryRun: true },
            run.deps
        );

        expect(result).toEqual({
            checked: 5,
            lastAsin: 'B0TST00005',
            transitions: {
                'nonMerch->merch': 1,
                'unknown->nonMerch': 1,
                'nonMerch->nonMerch': 1,
                'merch->merch': 1,
                'unknown->missing': 1,
            },
        });
        expect(run.writes).toEqual([]);
    });

    it('writes fetched batches, honors the limit, and waits out deferred capacity', async () => {
        const run = harness({ deferFirst: true });
        const result = await reclassifyMerchListings(
            { afterAsin: '', limit: 3, dryRun: false },
            run.deps
        );

        expect(result.checked).toBe(3);
        expect(run.reads).toEqual([
            ['', 3],
            ['B0TST00002', 1],
        ]);
        expect(run.sleeps).toHaveLength(1);
        expect(run.writes.map(batch => batch.map(product => product.asin))).toEqual([
            ['B0TST00001', 'B0TST00002'],
            ['B0TST00003'],
        ]);
    });
});
