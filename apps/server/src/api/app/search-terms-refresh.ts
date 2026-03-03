import { appProcedure } from '@/api/trpc.js';
import {
    mapTopSearchTermsStatus,
    resolveTopSearchTermsWindow,
    searchTermsBaseInput,
} from '@/api/app/search-terms-shared.js';
import {
    ensureTopSearchTermsDataset,
    getTopSearchTermsDatasetByWindow,
} from '@/db/top-search-terms/datasets.js';
import { setTopSearchTermsDatasetQueued } from '@/db/top-search-terms/dataset-status.js';
import { sendFetchTopSearchTermsDatasetJob } from '@/services/top-search-terms-jobs.js';

const ACTIVE_FETCH_STATUS_STALE_MS = 30 * 60 * 1000;

export const searchTermsRefresh = appProcedure
    .input(searchTermsBaseInput.optional())
    .mutation(async ({ input }) => {
        const parsed = searchTermsBaseInput.parse(input ?? {});
        const window = resolveTopSearchTermsWindow(parsed);
        const dataset =
            (await getTopSearchTermsDatasetByWindow(window)) ??
            (await ensureTopSearchTermsDataset({ window, nextRefreshAt: new Date() }));
        const now = new Date();

        if (isFetchStatusActive(dataset) && !isFetchStatusStale(dataset, now)) {
            return {
                enqueued: false,
                status: mapTopSearchTermsStatus(dataset),
            };
        }

        const jobId = await sendFetchTopSearchTermsDatasetJob({
            datasetId: dataset.id,
        });
        if (!jobId) {
            const latestStatus = await getTopSearchTermsDatasetByWindow(window);
            return {
                enqueued: false,
                status: mapTopSearchTermsStatus(latestStatus),
            };
        }

        const status = await setTopSearchTermsDatasetQueued({
            datasetId: dataset.id,
            jobId,
            requestedAt: now,
        });

        return {
            enqueued: true,
            status: mapTopSearchTermsStatus(status),
        };
    });

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
