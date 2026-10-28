import { z } from 'zod';
import { autocompleteGate } from '@/db/provider-gates';
import { expandKeywordAutocomplete } from '@/services/keyword-autocomplete';
import { defineJob } from './job-router';
import { keywordQueueOptions, keywordQueues } from './keyword-job-queues';

// The once-per-seed Amazon autocomplete call. Its suggestions become keyword trials directly; each
// trial's first-page scan decides whether it is tracked.
export const autocompleteKeywordJob = defineJob(keywordQueues.autocomplete, {
    persistSuccess: 'didWork',
    startupSummary: 'one Amazon autocomplete call per tracked seed, gated by autocomplete spacing',
})
    .input(z.object({ queryId: z.string().uuid() }))
    .queue(keywordQueueOptions)
    .gate(autocompleteGate)
    .work(async job => {
        const result = await expandKeywordAutocomplete(job.data.queryId);
        return {
            ...result,
            followup: result.kind === 'deferred' ? { at: result.nextWakeAt } : null,
        };
    });
