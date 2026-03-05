import { z } from 'zod';
import type { TopSearchTermsWindow } from '@/db/top-search-terms/types.js';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces.js';
import { getDefaultTopSearchTermsWindow } from '@/services/top-search-terms-dataset-windows.js';
import { getPacificDateString } from '@/utils/date.js';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
export const US_MARKETPLACE_ID = SPAPI_US_MARKETPLACE_ID;

export const searchTermsBaseInput = z
    .object({
        dataEndDate: z.string().regex(dateRegex).optional(),
        dataStartDate: z.string().regex(dateRegex).optional(),
        marketplaceId: z.literal(US_MARKETPLACE_ID).default(US_MARKETPLACE_ID),
        reportPeriod: z.enum(['DAY', 'WEEK', 'MONTH']).default('DAY'),
    })
    .refine(
        input =>
            (input.dataStartDate && input.dataEndDate) ||
            (!input.dataStartDate && !input.dataEndDate),
        {
            message: 'dataStartDate and dataEndDate must be provided together.',
            path: ['dataStartDate'],
        }
    );

export const resolveTopSearchTermsWindow = (input: {
    marketplaceId: string;
    reportPeriod: 'DAY' | 'WEEK' | 'MONTH';
    dataStartDate?: string;
    dataEndDate?: string;
}): TopSearchTermsWindow => {
    const reportPeriod = normalizeTopSearchTermsReportPeriod(input.reportPeriod);

    if (input.dataStartDate && input.dataEndDate) {
        if (input.dataStartDate > input.dataEndDate) {
            throw new Error('dataStartDate must be less than or equal to dataEndDate.');
        }

        return {
            marketplaceId: input.marketplaceId,
            reportPeriod,
            dataEndDate: input.dataEndDate,
            dataStartDate: input.dataStartDate,
        };
    }

    return getDefaultTopSearchTermsWindow({
        marketplaceId: input.marketplaceId,
        reportPeriod,
        today: getPacificDateString(),
    });
};

export const normalizeTopSearchTermsReportPeriod = (
    reportPeriod: 'DAY' | 'WEEK' | 'MONTH'
): TopSearchTermsWindow['reportPeriod'] => {
    if (reportPeriod === 'MONTH') {
        return 'WEEK';
    }

    return reportPeriod;
};

export const mapTopSearchTermsStatus = (
    status:
        | {
              activeJobId: string | null;
              activeJobRequestedAt: string | null;
              fetchStartedAt: string | null;
              lastCompletedAt: string | null;
              lastError: string | null;
              lastFailedAt: string | null;
              status: 'idle' | 'queued' | 'in_progress' | 'completed' | 'failed';
              updatedAt: string;
          }
        | null
) => ({
    activeJobId: status?.activeJobId ?? null,
    activeJobRequestedAt: status?.activeJobRequestedAt ?? null,
    fetchStartedAt: status?.fetchStartedAt ?? null,
    lastCompletedAt: status?.lastCompletedAt ?? null,
    lastError: status?.lastError ?? null,
    lastFailedAt: status?.lastFailedAt ?? null,
    status: status?.status ?? 'idle',
    updatedAt: status?.updatedAt ?? null,
});
