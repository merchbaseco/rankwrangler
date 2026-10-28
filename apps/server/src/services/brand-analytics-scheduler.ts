import type { PgBoss } from 'pg-boss';
import { ensureBrandAnalyticsImport } from '@/db/brand-analytics-imports';
import { keywordQueues } from '@/jobs/keyword-job-queues';
import { queueBrandAnalyticsKeywords } from '@/jobs/register-brand-analytics-keywords';

// The six-hourly check: starts the newest week's import when it is due and nudges keyword listing,
// which picks up anything an interrupted chain left behind. Both ignore Pause sync. The import and
// listing jobs then schedule their own next steps.
export const scheduleBrandAnalytics = async (
    boss: Pick<PgBoss, 'send'>,
    dueImport: typeof ensureBrandAnalyticsImport = ensureBrandAnalyticsImport
) => {
    const due = await dueImport(new Date());
    if (due)
        await boss.send(keywordQueues.brandAnalytics, { importId: due.id }, { singletonKey: due.id });
    await queueBrandAnalyticsKeywords(boss);
    return { didWork: Boolean(due), importId: due?.id ?? null };
};
