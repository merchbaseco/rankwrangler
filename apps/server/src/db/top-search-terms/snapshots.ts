import { and, asc, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import {
    topSearchTermsKeywordDaily,
    topSearchTermsSnapshots,
} from '@/db/top-search-terms-schema.js';
import type { TopSearchTermsWindow } from '@/db/top-search-terms/types.js';
import type { BaKeywordRow } from '@/services/spapi/ba-keywords-aggregation.js';

const INSERT_CHUNK_SIZE = 1000;

export type TopSearchTermsSnapshotRecord = {
    id: string;
    datasetId: string;
    marketplaceId: string;
    reportPeriod: string;
    dataStartDate: string;
    dataEndDate: string;
    observedDate: string;
    reportId: string;
    sourceJobId: string;
    keywordCount: number;
    fetchedAt: string;
    createdAt: string;
    updatedAt: string;
};

export type TopSearchTermsKeywordListRow = {
    searchTerm: string;
    searchFrequencyRank: number;
    clickShareTop3Sum: number;
    conversionShareTop3Sum: number;
    topRowsCount: number;
    isMerchRelevant: boolean;
    merchReason: string;
};

export const saveTopSearchTermsSnapshot = async ({
    datasetId,
    window,
    observedDate,
    reportId,
    sourceJobId,
    fetchedAt,
    rows,
}: {
    datasetId: string;
    window: TopSearchTermsWindow;
    observedDate: string;
    reportId: string;
    sourceJobId: string;
    fetchedAt: Date;
    rows: BaKeywordRow[];
}) => {
    return await db.transaction(async tx => {
        const now = new Date();
        const [snapshot] = await tx
            .insert(topSearchTermsSnapshots)
            .values({
                datasetId,
                marketplaceId: window.marketplaceId,
                reportPeriod: window.reportPeriod,
                dataStartDate: window.dataStartDate,
                dataEndDate: window.dataEndDate,
                observedDate,
                reportId,
                sourceJobId,
                keywordCount: rows.length,
                fetchedAt,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: [topSearchTermsSnapshots.datasetId, topSearchTermsSnapshots.observedDate],
                set: {
                    reportId,
                    sourceJobId,
                    keywordCount: rows.length,
                    fetchedAt,
                    updatedAt: now,
                },
            })
            .returning();

        await tx
            .delete(topSearchTermsKeywordDaily)
            .where(eq(topSearchTermsKeywordDaily.snapshotId, snapshot.id));

        for (const chunk of chunkRows(rows, INSERT_CHUNK_SIZE)) {
            await tx.insert(topSearchTermsKeywordDaily).values(
                chunk.map(row => ({
                    snapshotId: snapshot.id,
                    datasetId,
                    marketplaceId: window.marketplaceId,
                    reportPeriod: window.reportPeriod,
                    dataStartDate: window.dataStartDate,
                    dataEndDate: window.dataEndDate,
                    observedDate,
                    searchTerm: row.searchTerm,
                    searchFrequencyRank: row.searchFrequencyRank,
                    clickShareTop3SumBasisPoints: toBasisPoints(row.clickShareTop3Sum),
                    conversionShareTop3SumBasisPoints: toBasisPoints(row.conversionShareTop3Sum),
                    topRowsCount: row.topRowsCount,
                    isMerchRelevant: row.isMerchRelevant,
                    merchReason: row.merchReason,
                }))
            );
        }

        return mapSnapshot(snapshot);
    });
};

export const getTopSearchTermsSnapshotById = async (snapshotId: string) => {
    const [snapshot] = await db
        .select()
        .from(topSearchTermsSnapshots)
        .where(eq(topSearchTermsSnapshots.id, snapshotId))
        .limit(1);

    return snapshot ? mapSnapshot(snapshot) : null;
};

export const getLatestTopSearchTermsSnapshotForDataset = async (datasetId: string) => {
    const [snapshot] = await db
        .select()
        .from(topSearchTermsSnapshots)
        .where(eq(topSearchTermsSnapshots.datasetId, datasetId))
        .orderBy(desc(topSearchTermsSnapshots.fetchedAt))
        .limit(1);

    return snapshot ? mapSnapshot(snapshot) : null;
};

export const listTopSearchTermsKeywords = async ({
    snapshotId,
    cursor,
    limit,
    minRank,
    maxRank,
    search,
    merchOnly,
}: {
    snapshotId: string;
    cursor: number;
    limit: number;
    minRank?: number;
    maxRank?: number;
    search?: string;
    merchOnly: boolean;
}) => {
    const filters = [eq(topSearchTermsKeywordDaily.snapshotId, snapshotId)];
    if (minRank) {
        filters.push(gte(topSearchTermsKeywordDaily.searchFrequencyRank, minRank));
    }
    if (maxRank) {
        filters.push(lte(topSearchTermsKeywordDaily.searchFrequencyRank, maxRank));
    }
    if (merchOnly) {
        filters.push(eq(topSearchTermsKeywordDaily.isMerchRelevant, true));
    }
    if (search) {
        filters.push(ilike(topSearchTermsKeywordDaily.searchTerm, `%${search}%`));
    }

    const whereClause = and(...filters);
    const [countRows, itemRows] = await Promise.all([
        db
            .select({ totalFiltered: sql<number>`count(*)::int` })
            .from(topSearchTermsKeywordDaily)
            .where(whereClause),
        db
            .select({
                searchTerm: topSearchTermsKeywordDaily.searchTerm,
                searchFrequencyRank: topSearchTermsKeywordDaily.searchFrequencyRank,
                clickShareTop3SumBasisPoints: topSearchTermsKeywordDaily.clickShareTop3SumBasisPoints,
                conversionShareTop3SumBasisPoints:
                    topSearchTermsKeywordDaily.conversionShareTop3SumBasisPoints,
                topRowsCount: topSearchTermsKeywordDaily.topRowsCount,
                isMerchRelevant: topSearchTermsKeywordDaily.isMerchRelevant,
                merchReason: topSearchTermsKeywordDaily.merchReason,
            })
            .from(topSearchTermsKeywordDaily)
            .where(whereClause)
            .orderBy(
                asc(topSearchTermsKeywordDaily.searchFrequencyRank),
                asc(topSearchTermsKeywordDaily.searchTerm)
            )
            .offset(cursor)
            .limit(limit),
    ]);

    const totalFiltered = countRows[0]?.totalFiltered ?? 0;
    const items = itemRows.map(mapKeywordListRow);
    const nextCursor = cursor + limit < totalFiltered ? cursor + limit : null;

    return { items, nextCursor, totalFiltered };
};

const mapSnapshot = (
    row: typeof topSearchTermsSnapshots.$inferSelect
): TopSearchTermsSnapshotRecord => ({
    id: row.id,
    datasetId: row.datasetId,
    marketplaceId: row.marketplaceId,
    reportPeriod: row.reportPeriod,
    dataStartDate: row.dataStartDate,
    dataEndDate: row.dataEndDate,
    observedDate: row.observedDate,
    reportId: row.reportId,
    sourceJobId: row.sourceJobId,
    keywordCount: row.keywordCount,
    fetchedAt: row.fetchedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
});

const mapKeywordListRow = (row: {
    searchTerm: string;
    searchFrequencyRank: number;
    clickShareTop3SumBasisPoints: number;
    conversionShareTop3SumBasisPoints: number;
    topRowsCount: number;
    isMerchRelevant: boolean;
    merchReason: string;
}): TopSearchTermsKeywordListRow => ({
    searchTerm: row.searchTerm,
    searchFrequencyRank: row.searchFrequencyRank,
    clickShareTop3Sum: row.clickShareTop3SumBasisPoints / 10000,
    conversionShareTop3Sum: row.conversionShareTop3SumBasisPoints / 10000,
    topRowsCount: row.topRowsCount,
    isMerchRelevant: row.isMerchRelevant,
    merchReason: row.merchReason,
});

const toBasisPoints = (value: number) => Math.round(value * 10000);

const chunkRows = <T>(values: T[], chunkSize: number): T[][] => {
    if (values.length <= chunkSize) {
        return [values];
    }

    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += chunkSize) {
        chunks.push(values.slice(index, index + chunkSize));
    }

    return chunks;
};
