import { appProcedure } from '@/api/trpc.js';
import { resolveBaDateWindow, searchTermsBaseInput } from '@/api/app/search-terms-shared.js';
import {
    getSearchTermsFetchStatus,
    setSearchTermsFetchQueued,
} from '@/db/search-terms/fetch-status.js';
import { sendFetchSearchTermsJob } from '@/services/search-terms-fetch-job.js';

const ACTIVE_FETCH_STATUS_STALE_MS = 30 * 60 * 1000;

export const searchTermsRefresh = appProcedure
    .input(searchTermsBaseInput.optional())
    .mutation(async ({ input }) => {
        const parsed = searchTermsBaseInput.parse(input ?? {});
        const dateWindow = resolveBaDateWindow(parsed);
        const window = {
            dataEndDate: dateWindow.dataEndDate,
            dataStartDate: dateWindow.dataStartDate,
            marketplaceId: parsed.marketplaceId,
            reportPeriod: parsed.reportPeriod,
        } as const;

        const now = new Date();
        const existingStatus = await getSearchTermsFetchStatus(window);
        if (
            isFetchStatusActive(existingStatus) &&
            !isFetchStatusStale(existingStatus, now)
        ) {
            return {
                enqueued: false,
                status: mapFetchStatus(existingStatus),
            };
        }

        const jobId = await sendFetchSearchTermsJob(window);
        if (!jobId) {
            const latestStatus = await getSearchTermsFetchStatus(window);
            return {
                enqueued: false,
                status: mapFetchStatus(latestStatus),
            };
        }

        const status = await setSearchTermsFetchQueued({
            window,
            jobId,
            requestedAt: now,
        });

        return {
            enqueued: true,
            status: mapFetchStatus(status),
        };
    });

const mapFetchStatus = (
    status:
        | {
              status: 'idle' | 'queued' | 'in_progress' | 'completed' | 'failed';
              activeJobId: string | null;
              activeJobRequestedAt: string | null;
              fetchStartedAt: string | null;
              lastCompletedAt: string | null;
              lastCompletedSnapshotId: string | null;
              lastError: string | null;
              lastFailedAt: string | null;
              updatedAt: string;
          }
        | null
) => {
    return {
        activeJobId: status?.activeJobId ?? null,
        activeJobRequestedAt: status?.activeJobRequestedAt ?? null,
        fetchStartedAt: status?.fetchStartedAt ?? null,
        lastCompletedAt: status?.lastCompletedAt ?? null,
        lastCompletedSnapshotId: status?.lastCompletedSnapshotId ?? null,
        lastError: status?.lastError ?? null,
        lastFailedAt: status?.lastFailedAt ?? null,
        status: status?.status ?? 'idle',
        updatedAt: status?.updatedAt ?? null,
    };
};

const isFetchStatusActive = (
    status:
        | {
              status: 'idle' | 'queued' | 'in_progress' | 'completed' | 'failed';
          }
        | null
) => status?.status === 'queued' || status?.status === 'in_progress';

const isFetchStatusStale = (
    status:
        | {
              status: 'idle' | 'queued' | 'in_progress' | 'completed' | 'failed';
              activeJobRequestedAt: string | null;
              fetchStartedAt: string | null;
              updatedAt: string;
          }
        | null,
    now: Date
) => {
    if (!isFetchStatusActive(status)) {
        return false;
    }

    const reference =
        status.fetchStartedAt ?? status.activeJobRequestedAt ?? status.updatedAt;
    const referenceMs = Date.parse(reference);
    if (Number.isNaN(referenceMs)) {
        return true;
    }

    return now.getTime() - referenceMs >= ACTIVE_FETCH_STATUS_STALE_MS;
};
