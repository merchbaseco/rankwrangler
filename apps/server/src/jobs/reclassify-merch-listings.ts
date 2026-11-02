import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '@/db/index';
import { upsertProductsInfo } from '@/db/product/upsert-product';
import { products } from '@/db/product-schema';
import { defineJob } from '@/jobs/job-router';
import {
    RECLASSIFY_MERCH_LISTINGS_JOB,
    type ReclassifyMerchListingsInput,
    reclassifyMerchListingsInput,
} from '@/jobs/reclassify-merch-listings-input';
import { reclassifyMerchListings } from '@/services/merch-reclassification';
import { searchCatalogItemsByAsins } from '@/services/spapi/search-catalog-items-by-asins';

// Operator-started (`src/scripts/reclassify-merch-listings.ts`): re-fetches every active US Product
// and writes the current Merch verdict. Each job checks one chunk and queues the next, so the run
// lives in the server process, shares the one Catalog limiter as background work, and survives
// deploys. A paused sync ends the chunk early and the next one waits a minute.
export const reclassifyMerchListingsJob = defineJob(RECLASSIFY_MERCH_LISTINGS_JOB, {
    startupSummary:
        'operator-started Merch reclassification, one chunk per job (background SP-API)',
})
    .input(reclassifyMerchListingsInput)
    // One run at a time: a chunk may queue its successor while it is still active.
    .queue({ policy: 'stately' })
    .options({ singletonKey: RECLASSIFY_MERCH_LISTINGS_JOB, retryLimit: 5, retryBackoff: true })
    .work(async (job, _signal, log, { boss }) => {
        const input = job.data;
        const chunk = await reclassifyMerchListings(
            {
                afterAsin: input.afterAsin,
                limit: Math.min(chunkSize, input.remaining ?? chunkSize),
                dryRun: input.dryRun,
            },
            {
                readBatch: async (after, size) =>
                    await db
                        .select({ asin: products.asin, isMerchListing: products.isMerchListing })
                        .from(products)
                        .where(
                            and(
                                eq(products.marketplaceId, US_MARKETPLACE_ID),
                                eq(products.amazonListingStatus, 'active'),
                                gt(products.asin, after)
                            )
                        )
                        .orderBy(asc(products.asin))
                        .limit(size),
                fetchProducts: async asins =>
                    await searchCatalogItemsByAsins(US_MARKETPLACE_ID, asins, {
                        priority: 'background',
                    }),
                writeProducts: async fetched => {
                    await upsertProductsInfo(fetched);
                },
                log,
            }
        );
        const remaining = input.remaining === null ? null : input.remaining - chunk.checked;
        const next: ReclassifyMerchListingsInput = {
            afterAsin: chunk.lastAsin,
            dryRun: input.dryRun,
            remaining,
            checked: input.checked + chunk.checked,
            transitions: addTransitions(input.transitions, chunk.transitions),
        };
        const finished = chunk.exhausted || remaining === 0;
        if (!finished)
            await boss.send(RECLASSIFY_MERCH_LISTINGS_JOB, next, {
                singletonKey: RECLASSIFY_MERCH_LISTINGS_JOB,
                startAfter: chunk.paused ? pausedRetrySeconds : undefined,
            });
        return { ...next, chunk: chunk.checked, paused: chunk.paused, finished };
    });

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';
// About 25 Catalog calls: a few minutes behind keyword scans, well inside the job's expiry.
const chunkSize = 500;
const pausedRetrySeconds = 60;

const addTransitions = (totals: Record<string, number>, chunk: Record<string, number>) => {
    const sum = { ...totals };
    for (const [key, count] of Object.entries(chunk)) sum[key] = (sum[key] ?? 0) + count;
    return sum;
};
