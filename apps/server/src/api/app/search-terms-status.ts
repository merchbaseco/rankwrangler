import { appProcedure } from '@/api/trpc.js';
import { resolveBaDateWindow, searchTermsBaseInput } from '@/api/app/search-terms-shared.js';
import { getSearchTermsFetchStatus } from '@/db/search-terms/fetch-status.js';

export const searchTermsStatus = appProcedure
    .input(searchTermsBaseInput.optional())
    .query(async ({ input }) => {
        const parsed = searchTermsBaseInput.parse(input ?? {});
        const dateWindow = resolveBaDateWindow(parsed);
        const status = await getSearchTermsFetchStatus({
            dataEndDate: dateWindow.dataEndDate,
            dataStartDate: dateWindow.dataStartDate,
            marketplaceId: parsed.marketplaceId,
            reportPeriod: parsed.reportPeriod,
        });

        return {
            dataEndDate: dateWindow.dataEndDate,
            dataStartDate: dateWindow.dataStartDate,
            marketplaceId: parsed.marketplaceId,
            reportPeriod: parsed.reportPeriod,
            status: {
                activeJobId: status?.activeJobId ?? null,
                activeJobRequestedAt: status?.activeJobRequestedAt ?? null,
                fetchStartedAt: status?.fetchStartedAt ?? null,
                lastCompletedAt: status?.lastCompletedAt ?? null,
                lastCompletedSnapshotId: status?.lastCompletedSnapshotId ?? null,
                lastError: status?.lastError ?? null,
                lastFailedAt: status?.lastFailedAt ?? null,
                status: status?.status ?? 'idle',
                updatedAt: status?.updatedAt ?? null,
            },
        };
    });
