import type { PgBoss } from 'pg-boss';

// One queue per provider (see docs/decisions/background-jobs.md). Each queue holds at most one
// queued-or-running job per entity, so schedulers can re-enqueue due work without duplicates.
export const keywordQueues = {
    scan: 'scan-keyword',
    recommend: 'recommend-product-keywords',
    judge: 'judge-keywords',
    autocomplete: 'autocomplete-keyword',
} as const;
export const keywordQueueOptions = {
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds: 600,
} as const;

// Keeping existing keywords fresh comes before extending them with deeper pages.
export const scanPriority = { head: 1, depth: 0 } as const;

export type JudgmentSubject = { kind: 'product'; productId: string } | { kind: 'seed'; queryId: string };

export const enqueueKeywordScan = (
    boss: PgBoss,
    targetId: string,
    work: keyof typeof scanPriority,
    startAfter?: Date
) =>
    boss.send(
        keywordQueues.scan,
        { targetId },
        { singletonKey: targetId, priority: scanPriority[work], startAfter }
    );

export const enqueueProductRecommendations = (boss: PgBoss, productId: string) =>
    boss.send(keywordQueues.recommend, { productId }, { singletonKey: productId });

export const enqueueKeywordJudgment = (boss: PgBoss, subject: JudgmentSubject) =>
    boss.send(keywordQueues.judge, subject, { singletonKey: judgmentKey(subject) });

export const enqueueKeywordAutocomplete = (boss: PgBoss, queryId: string) =>
    boss.send(keywordQueues.autocomplete, { queryId }, { singletonKey: queryId });

const judgmentKey = (subject: JudgmentSubject) =>
    subject.kind === 'product' ? `product:${subject.productId}` : `seed:${subject.queryId}`;
