import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { resolveBaDateWindow, searchTermsBaseInput } from '@/api/app/search-terms-shared.js';
import {
    getSearchTermsFetchStatus,
    type SearchTermsFetchStatusRecord,
} from '@/db/search-terms/fetch-status.js';
import {
    getLatestSearchTermsSnapshot,
    getSearchTermsSnapshotById,
    listSearchTermsKeywords,
} from '@/db/search-terms/snapshots.js';

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
        const dateWindow = resolveBaDateWindow(parsed);
        const window = {
            dataEndDate: dateWindow.dataEndDate,
            dataStartDate: dateWindow.dataStartDate,
            marketplaceId: parsed.marketplaceId,
            reportPeriod: parsed.reportPeriod,
        } as const;

        const statusRecord = await getSearchTermsFetchStatus(window);
        const snapshot = await resolveSnapshot(window, statusRecord?.lastCompletedSnapshotId ?? null);

        if (!snapshot) {
            return {
                items: [],
                nextCursor: null,
                summary: {
                    dataEndDate: dateWindow.dataEndDate,
                    dataStartDate: dateWindow.dataStartDate,
                    fetchedAt: null,
                    marketplaceId: parsed.marketplaceId,
                    reportId: null,
                    reportPeriod: parsed.reportPeriod,
                    status: mapFetchStatus(statusRecord),
                    totalFiltered: 0,
                    totalSearchTerms: 0,
                },
            };
        }

        const listed = await listSearchTermsKeywords({
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
                status: mapFetchStatus(statusRecord),
                totalFiltered: listed.totalFiltered,
                totalSearchTerms: snapshot.keywordCount,
            },
        };
    });

const resolveSnapshot = async (
    window: {
        dataEndDate: string;
        dataStartDate: string;
        marketplaceId: string;
        reportPeriod: 'MONTH' | 'WEEK';
    },
    snapshotId: string | null
) => {
    if (snapshotId) {
        const byId = await getSearchTermsSnapshotById(snapshotId);
        if (byId) {
            return byId;
        }
    }

    return await getLatestSearchTermsSnapshot(window);
};

const mapFetchStatus = (status: SearchTermsFetchStatusRecord | null) => {
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
