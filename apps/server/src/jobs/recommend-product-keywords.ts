import { z } from 'zod';
import { adsGate } from '@/db/provider-gates';
import { mineProductKeywords } from '@/services/product-keyword-mining';
import { defineJob } from './job-router';
import { enqueueKeywordJudgment, keywordQueueOptions, keywordQueues } from './keyword-job-queues';

// The once-per-product Amazon Ads call. A saved response hands the product to judge-keywords.
export const recommendProductKeywordsJob = defineJob(keywordQueues.recommend, {
    persistSuccess: 'didWork',
    startupSummary: 'one Amazon Ads recommendation call per mined product, gated by Ads spacing',
})
    .input(z.object({ productId: z.string().uuid() }))
    .queue(keywordQueueOptions)
    .gate(adsGate)
    .work(async (job, _signal, _log, { boss }) => {
        const { productId } = job.data;
        const result = await mineProductKeywords(undefined, { kind: 'source', productId });
        if (result.kind === 'yielded')
            await enqueueKeywordJudgment(boss, { kind: 'product', productId });
        return {
            ...result,
            followup: result.kind === 'deferred' ? { at: result.nextWakeAt } : null,
        };
    });
