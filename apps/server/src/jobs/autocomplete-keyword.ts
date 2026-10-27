import { z } from 'zod';
import { autocompleteGate } from '@/db/provider-gates';
import { expandKeywordAutocomplete } from '@/services/keyword-autocomplete';
import { defineJob } from './job-router';
import { enqueueKeywordJudgment, keywordQueueOptions, keywordQueues } from './keyword-job-queues';

// The once-per-seed Amazon autocomplete call. Saved suggestions hand the seed to judge-keywords.
export const autocompleteKeywordJob = defineJob(keywordQueues.autocomplete, {
    persistSuccess: 'didWork',
    startupSummary: 'one Amazon autocomplete call per tracked seed, gated by autocomplete spacing',
})
    .input(z.object({ queryId: z.string().uuid() }))
    .queue(keywordQueueOptions)
    .gate(autocompleteGate)
    .work(async (job, _signal, _log, { boss }) => {
        const { queryId } = job.data;
        const result = await expandKeywordAutocomplete(undefined, { kind: 'source', queryId });
        if (result.kind === 'yielded')
            await enqueueKeywordJudgment(boss, { kind: 'seed', queryId });
        return {
            ...result,
            followup: result.kind === 'deferred' ? { at: result.nextWakeAt } : null,
        };
    });
