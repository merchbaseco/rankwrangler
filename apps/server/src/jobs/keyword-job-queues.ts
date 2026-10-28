// One queue per provider (see docs/decisions/background-jobs.md). Each queue holds at most one
// queued-or-running job per entity, so schedulers can re-enqueue due work without duplicates.
export const keywordQueues = {
    scan: 'scan-keyword',
    autocomplete: 'autocomplete-keyword',
    brandAnalytics: 'import-brand-analytics',
} as const;
export const keywordQueueOptions = {
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds: 600,
} as const;

// Keeping existing keywords fresh comes before extending them with deeper pages.
export const scanPriority = { head: 1, depth: 0 } as const;
