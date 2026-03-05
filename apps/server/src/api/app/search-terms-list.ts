import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import {
    mapTopSearchTermsStatus,
    normalizeTopSearchTermsReportPeriod,
    resolveTopSearchTermsWindow,
    searchTermsBaseInput,
} from '@/api/app/search-terms-shared.js';
import {
    getLatestTopSearchTermsDataset,
    getTopSearchTermsDatasetByWindow,
} from '@/db/top-search-terms/datasets.js';
import {
    getLatestTopSearchTermsSnapshotForDataset,
    listTopSearchTermsKeywords,
} from '@/db/top-search-terms/snapshots.js';

const searchTermsListInput = searchTermsBaseInput.extend({
    cursor: z.number().int().min(0).optional(),
    limit: z.number().int().min(10).max(200).default(100),
    maxRank: z.number().int().min(1).optional(),
    merchOnly: z.boolean().default(true),
    minRank: z.number().int().min(1).optional(),
    search: z.string().trim().max(200).optional(),
});

export const searchTermsList = appProcedure
    .input(searchTermsListInput.optional())
    .query(async ({ input }) => {
        const parsed = searchTermsListInput.parse(input ?? {});
        const reportPeriod = normalizeTopSearchTermsReportPeriod(parsed.reportPeriod);
        const hasExplicitWindow = Boolean(parsed.dataStartDate && parsed.dataEndDate);
        const requestedWindow = resolveTopSearchTermsWindow(parsed);
        const dataset = hasExplicitWindow
            ? await getTopSearchTermsDatasetByWindow(requestedWindow)
            : await getLatestTopSearchTermsDataset({
                  marketplaceId: parsed.marketplaceId,
                  reportPeriod,
                  status: 'completed',
              });

        if (!dataset) {
            return {
                items: [],
                nextCursor: null,
                summary: {
                    dataEndDate: requestedWindow.dataEndDate,
                    dataStartDate: requestedWindow.dataStartDate,
                    fetchedAt: null,
                    marketplaceId: parsed.marketplaceId,
                    reportId: null,
                    reportPeriod,
                    status: mapTopSearchTermsStatus(null),
                    totalFiltered: 0,
                    totalSearchTerms: 0,
                },
            };
        }

        const snapshot = await getLatestTopSearchTermsSnapshotForDataset(dataset.id);
        if (!snapshot) {
            return {
                items: [],
                nextCursor: null,
                summary: {
                    dataEndDate: dataset.dataEndDate,
                    dataStartDate: dataset.dataStartDate,
                    fetchedAt: null,
                    marketplaceId: dataset.marketplaceId,
                    reportId: dataset.reportId,
                    reportPeriod: dataset.reportPeriod,
                    status: mapTopSearchTermsStatus(dataset),
                    totalFiltered: 0,
                    totalSearchTerms: 0,
                },
            };
        }

        const listed = await listTopSearchTermsKeywords({
            snapshotId: snapshot.id,
            cursor: parsed.cursor ?? 0,
            limit: parsed.limit,
            maxRank: parsed.maxRank,
            merchOnly: parsed.merchOnly,
            minRank: parsed.minRank,
            search: parsed.search?.trim() ? parsed.search.trim() : undefined,
        });

        return {
            items: listed.items,
            nextCursor: listed.nextCursor,
            summary: {
                dataEndDate: snapshot.dataEndDate,
                dataStartDate: snapshot.dataStartDate,
                fetchedAt: snapshot.fetchedAt,
                marketplaceId: snapshot.marketplaceId,
                observedDate: snapshot.observedDate,
                reportId: snapshot.reportId,
                reportPeriod: snapshot.reportPeriod,
                status: mapTopSearchTermsStatus(dataset),
                totalFiltered: listed.totalFiltered,
                totalSearchTerms: snapshot.keywordCount,
            },
        };
    });
