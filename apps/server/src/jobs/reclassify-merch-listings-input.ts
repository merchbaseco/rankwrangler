import { z } from 'zod';

// Kept apart from the job so the operator script that starts a run imports no SP-API code.
export const RECLASSIFY_MERCH_LISTINGS_JOB = 'reclassify-merch-listings';

// One run's progress, carried from chunk to chunk: where to resume, how many Products are left
// (null for all), and the running totals.
export const reclassifyMerchListingsInput = z.object({
    afterAsin: z.string(),
    dryRun: z.boolean(),
    remaining: z.number().int().positive().nullable(),
    checked: z.number().int().nonnegative(),
    transitions: z.record(z.string(), z.number().int().nonnegative()),
});

export type ReclassifyMerchListingsInput = z.infer<typeof reclassifyMerchListingsInput>;
