import { readAutomaticSync } from '@/db/automatic-sync';
import { readJobQueueCounts } from '@/db/job-queue-status';
import { readKeywordProviderUsage } from '@/db/keyword-mining-capacity';
import { readScanBacklog } from '@/db/keyword-scan-backlog';
import {
    adsGate,
    autocompleteGate,
    jevGate,
    type ProviderGate,
    spApiBackgroundGate,
} from '@/db/provider-gates';
import { keywordQueues } from '@/jobs/keyword-job-queues';
import { SCAN_BACKLOG_DAYS } from './keyword-scan-backpressure';

type Limited = 'ads' | 'jev' | 'autocomplete';
const queues: readonly {
    name: string;
    provider: string;
    gate: ProviderGate | null;
    limited?: Limited;
}[] = [
    { name: 'schedule-keyword-work', provider: 'None', gate: null },
    { name: keywordQueues.scan, provider: 'SP-API', gate: spApiBackgroundGate },
    { name: keywordQueues.recommend, provider: 'Amazon Ads', gate: adsGate, limited: 'ads' },
    { name: keywordQueues.judge, provider: 'Jev', gate: jevGate, limited: 'jev' },
    {
        name: keywordQueues.autocomplete,
        provider: 'Amazon autocomplete',
        gate: autocompleteGate,
        limited: 'autocomplete',
    },
];

// One operator read: pause state, scan backlog against its allowance, and for each keyword queue
// its live counts and whether its provider can start now.
export const readKeywordJobsStatus = async () => {
    const now = new Date();
    const [control, backlog, counts, readiness, usage] = await Promise.all([
        readAutomaticSync(),
        readScanBacklog(now),
        readJobQueueCounts(queues.map(queue => queue.name)),
        Promise.all(queues.map(queue => queue.gate?.(now) ?? Promise.resolve(now))),
        readKeywordProviderUsage(now),
    ]);
    return {
        paused: control.paused,
        backlog: {
            ...backlog,
            allowancePages: backlog.pagesPerDay * SCAN_BACKLOG_DAYS,
            oldestDueHeadAt: iso(backlog.oldestDueHeadAt),
        },
        queues: queues.map((queue, index) => {
            const row = counts.find(count => count.name === queue.name);
            const readyAt = readiness[index];
            const today = usage.find(row => row.provider === queue.limited);
            return {
                usage: queue.limited
                    ? {
                          startsToday: today?.startsToday ?? 0,
                          dailyLimit: today?.dailyLimit ?? null,
                          tokensToday: today?.tokensToday ?? 0,
                      }
                    : null,
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

export const keywordJobNames = queues.map(queue => queue.name);

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);
