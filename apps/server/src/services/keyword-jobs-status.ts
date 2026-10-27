import { readAutomaticSync } from '@/db/automatic-sync';
import { readJobQueueCounts } from '@/db/job-queue-status';
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

const queues: readonly { name: string; provider: string; gate: ProviderGate | null }[] = [
    { name: 'schedule-keyword-work', provider: 'None', gate: null },
    { name: keywordQueues.scan, provider: 'SP-API', gate: spApiBackgroundGate },
    { name: keywordQueues.recommend, provider: 'Amazon Ads', gate: adsGate },
    { name: keywordQueues.judge, provider: 'Jev', gate: jevGate },
    { name: keywordQueues.autocomplete, provider: 'Amazon autocomplete', gate: autocompleteGate },
];

// One operator read: pause state, scan backlog against its allowance, and for each keyword queue
// its live counts and whether its provider can start now.
export const readKeywordJobsStatus = async () => {
    const now = new Date();
    const [control, backlog, counts, readiness] = await Promise.all([
        readAutomaticSync(),
        readScanBacklog(now),
        readJobQueueCounts(queues.map(queue => queue.name)),
        Promise.all(queues.map(queue => queue.gate?.(now) ?? Promise.resolve(now))),
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
            return {
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
