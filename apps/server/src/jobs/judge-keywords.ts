import { z } from 'zod';
import { jevGate } from '@/db/provider-gates';
import { expandKeywordAutocomplete } from '@/services/keyword-autocomplete';
import { mineProductKeywords } from '@/services/product-keyword-mining';
import { defineJob } from './job-router';
import { keywordQueueOptions, keywordQueues } from './keyword-job-queues';

const subjectSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('product'), productId: z.string().uuid() }),
    z.object({ kind: z.literal('seed'), queryId: z.string().uuid() }),
]);

// One Jev request for one saved response: a product's fit or relevance batch, or a seed's
// suggestions. Requeues itself until that product or seed has finished its selection.
export const judgeKeywordsJob = defineJob(keywordQueues.judge, {
    persistSuccess: 'didWork',
    startupSummary: 'one Jev batch per job for saved Ads or autocomplete responses',
})
    .input(subjectSchema)
    .queue(keywordQueueOptions)
    .gate(jevGate)
    .work(async job => {
        const subject = job.data;
        const result =
            subject.kind === 'product'
                ? await mineProductKeywords(undefined, {
                      kind: 'judgment',
                      productId: subject.productId,
                  })
                : await expandKeywordAutocomplete(undefined, {
                      kind: 'judgment',
                      queryId: subject.queryId,
                  });
        return { ...subject, ...result, followup: followupFor(result) };
    });

// Without progress, another claimant holds this subject's phrases; look again in thirty seconds.
const followupFor = (result: { kind: string; didWork: boolean; nextWakeAt: Date | null }) => {
    if (result.kind === 'deferred' && result.nextWakeAt) return { at: result.nextWakeAt };
    if (result.kind !== 'yielded') return null;
    return { at: new Date(Date.now() + (result.didWork ? 0 : 30_000)) };
};
