import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import {
    getLatestObservedDateForTopSearchTerm,
    listTopSearchTermTrendPoints,
} from '@/db/top-search-terms/trends.js';
import {
    normalizeTopSearchTermsReportPeriod,
    US_MARKETPLACE_ID,
} from '@/api/app/search-terms-shared.js';
import {
    calculateSearchTermsTrendDeltas,
    clampTrendRangeDays,
    getTrendStartDate,
} from '@/services/top-search-terms-trend.js';

const searchtermsTrendInput = z.object({
    marketplaceId: z.literal(US_MARKETPLACE_ID).default(US_MARKETPLACE_ID),
    reportPeriod: z.enum(['DAY', 'WEEK', 'MONTH']).default('DAY'),
    rangeDays: z.number().int().min(7).max(365).default(90),
    searchTerm: z.string().trim().min(1, 'Search term is required').max(200),
});

export const searchtermsTrend = appProcedure
    .input(searchtermsTrendInput)
    .query(async ({ input }) => {
        const reportPeriod = normalizeTopSearchTermsReportPeriod(input.reportPeriod);
        const rangeDays = clampTrendRangeDays(input.rangeDays);
        const latestObservedDate = await getLatestObservedDateForTopSearchTerm({
            marketplaceId: input.marketplaceId,
            reportPeriod,
            searchTerm: input.searchTerm,
        });

        if (!latestObservedDate) {
            return {
                deltas: calculateSearchTermsTrendDeltas([]),
                points: [],
                summary: {
                    latestObservedDate: null,
                    marketplaceId: input.marketplaceId,
                    rangeDays,
                    reportPeriod,
                    searchTerm: input.searchTerm,
                },
            };
        }

        const observedDateFrom = getTrendStartDate({
            latestObservedDate,
            days: rangeDays,
        });
        const points = await listTopSearchTermTrendPoints({
            marketplaceId: input.marketplaceId,
            reportPeriod,
            searchTerm: input.searchTerm,
            observedDateFrom,
        });

        return {
            deltas: calculateSearchTermsTrendDeltas(points),
            points,
            summary: {
                latestObservedDate,
                marketplaceId: input.marketplaceId,
                rangeDays,
                reportPeriod,
                searchTerm: input.searchTerm,
            },
        };
    });
