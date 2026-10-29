import { readAutomaticSync } from '@/db/automatic-sync';
import { readBrandAnalyticsStatus } from '@/db/brand-analytics-imports';
import { readJobQueueCounts } from '@/db/job-queue-status';
import { readAutocompleteUsage } from '@/db/keyword-autocomplete-capacity';
import { readKeywordThemeCounts } from '@/db/keyword-themes';
import { readScanBacklog } from '@/db/keyword-scan-backlog';
import { autocompleteGate, type ProviderGate, spApiBackgroundGate } from '@/db/provider-gates';
import { keywordQueues } from '@/jobs/keyword-job-queues';
import { SCAN_BACKLOG_DAYS } from './keyword-scan-backpressure';

const queues: readonly {
    name: string;
    provider: string;
    gate: ProviderGate | null;
    limited?: true;
}[] = [
    { name: 'schedule-keyword-work', provider: 'None', gate: null },
    { name: keywordQueues.scan, provider: 'SP-API', gate: spApiBackgroundGate },
    {
        name: keywordQueues.autocomplete,
        provider: 'Amazon autocomplete',
        gate: autocompleteGate,
        limited: true,
    },
    { name: keywordQueues.brandAnalytics, provider: 'SP-API Reports', gate: null },
];

// One operator read: pause state, scan backlog against its allowance, the weekly Brand Analytics
// import, keyword theme counts, and for each keyword queue its live counts and whether its provider can start now.
export const readKeywordJobsStatus = async () => {
    const now = new Date();
    const [control, backlog, counts, readiness, usage, brandAnalytics, themes] = await Promise.all([
        readAutomaticSync(),
        readScanBacklog(now),
        readJobQueueCounts(queues.map(queue => queue.name)),
        Promise.all(queues.map(queue => queue.gate?.(now) ?? Promise.resolve(now))),
        readAutocompleteUsage(now),
        readBrandAnalyticsStatus(),
        readKeywordThemeCounts(),
    ]);
    return {
        paused: control.paused,
        backlog: {
            ...backlog,
            allowancePages: backlog.pagesPerDay * SCAN_BACKLOG_DAYS,
            oldestDueHeadAt: iso(backlog.oldestDueHeadAt),
        },
        brandAnalytics: {
            latestWeek: brandAnalytics.latest
                ? {
                      weekStart: brandAnalytics.latest.weekStart,
                      weekEnd: brandAnalytics.latest.weekEnd,
                      status: brandAnalytics.latest.status,
                      reportStatus: brandAnalytics.latest.reportStatus,
                      nextAttemptAt: iso(brandAnalytics.latest.nextAttemptAt),
                      lastError: brandAnalytics.latest.lastError,
                  }
                : null,
            lastImported: brandAnalytics.lastImported
                ? {
                      weekStart: brandAnalytics.lastImported.weekStart,
                      weekEnd: brandAnalytics.lastImported.weekEnd,
                      importedAt: iso(brandAnalytics.lastImported.importedAt),
                      rows: brandAnalytics.lastImported.rows,
                      terms: brandAnalytics.lastImported.terms,
                      keptTerms: brandAnalytics.lastImported.keptTerms,
                      newTerms: brandAnalytics.lastImported.newTerms,
                  }
                : null,
            keptTerms: brandAnalytics.terms?.kept ?? 0,
            awaitingTrial: brandAnalytics.terms?.unregistered ?? 0,
            awaitingTheme: brandAnalytics.terms?.awaiting_theme ?? 0,
        },
        themes,
        queues: queues.map((queue, index) => {
            const row = counts.find(count => count.name === queue.name);
            const readyAt = readiness[index];
            return {
                usage: queue.limited ? usage : null,
                name: queue.name,
                provider: queue.provider,
                providerReadyAt: readyAt && readyAt > now ? readyAt.toISOString() : null,
                waiting: row?.waiting ?? 0,
                scheduled: row?.scheduled ?? 0,
                running: row?.running ?? 0,
                oldestWaitingAt: iso(row?.oldest_waiting_at ?? null),
            };
        }),
    };
};

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);
