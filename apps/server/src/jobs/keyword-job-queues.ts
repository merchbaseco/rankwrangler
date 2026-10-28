// One queue per provider (see docs/decisions/background-jobs.md). Each queue holds at most one
// queued-or-running job per entity, so schedulers can re-enqueue due work without duplicates.
export const keywordQueues = {
    scan: 'scan-keyword',
    autocomplete: 'autocomplete-keyword',
    brandAnalytics: 'import-brand-analytics',
    brandAnalyticsKeywords: 'register-brand-analytics-keywords',
} as const;
export const keywordQueueOptions = {
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds: 600,
} as const;

// Re-checking graduated keywords comes first, then trial keywords' qualifying first page, then
// deeper pages. Without the split, ~200k queued trial checks delayed due re-checks by hours.
export const scanPriority = { recheck: 2, head: 1, depth: 0 } as const;
