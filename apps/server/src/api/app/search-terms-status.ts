import { appProcedure } from '@/api/trpc.js';
import {
    mapTopSearchTermsStatus,
    resolveTopSearchTermsWindow,
    searchTermsBaseInput,
} from '@/api/app/search-terms-shared.js';
import { getTopSearchTermsDatasetByWindow } from '@/db/top-search-terms/datasets.js';

export const searchTermsStatus = appProcedure
    .input(searchTermsBaseInput.optional())
    .query(async ({ input }) => {
        const parsed = searchTermsBaseInput.parse(input ?? {});
        const window = resolveTopSearchTermsWindow(parsed);
        const status = await getTopSearchTermsDatasetByWindow(window);

        return {
            dataEndDate: window.dataEndDate,
            dataStartDate: window.dataStartDate,
            marketplaceId: parsed.marketplaceId,
            reportPeriod: window.reportPeriod,
            status: mapTopSearchTermsStatus(status),
        };
    });
