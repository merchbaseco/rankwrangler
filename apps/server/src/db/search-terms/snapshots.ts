import { and, asc, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm';
import { searchTermsKeywordDaily, searchTermsSnapshots } from '@/db/search-terms-schema.js';
import { db } from '@/db/index.js';
import type { BaKeywordRow } from '@/services/spapi/ba-keywords-aggregation.js';
import type { SearchTermsWindow } from '@/db/search-terms/fetch-status.js';

const INSERT_CHUNK_SIZE = 1000;

export type SearchTermsSnapshotRecord = {
    id: string;
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

export type SearchTermsKeywordListRow = {
    searchTerm: string;
    searchFrequencyRank: number;
    clickShareTop3Sum: number;
    conversionShareTop3Sum: number;
    topRowsCount: number;
    isMerchRelevant: boolean;
    merchReason: string;
};

export const saveSearchTermsSnapshot = async ({
    window,
    observedDate,
    reportId,
    sourceJobId,
    fetchedAt,
    rows,
}: {
    window: SearchTermsWindow;
    observedDate: string;
    reportId: string;
    sourceJobId: string;
    fetchedAt: Date;
    rows: BaKeywordRow[];
}) => {
    return await db.transaction(async tx => {
        const now = new Date();
        const [snapshot] = await tx
            .insert(searchTermsSnapshots)
            .values({
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
                target: [
                    searchTermsSnapshots.marketplaceId,
                    searchTermsSnapshots.reportPeriod,
                    searchTermsSnapshots.dataStartDate,
                    searchTermsSnapshots.dataEndDate,
                    searchTermsSnapshots.observedDate,
                ],
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
            .delete(searchTermsKeywordDaily)
            .where(eq(searchTermsKeywordDaily.snapshotId, snapshot.id));

        for (const chunk of chunkRows(rows, INSERT_CHUNK_SIZE)) {
            await tx.insert(searchTermsKeywordDaily).values(
                chunk.map(row => ({
                    snapshotId: snapshot.id,
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

export const getSearchTermsSnapshotById = async (snapshotId: string) => {
    const [snapshot] = await db
        .select()
        .from(searchTermsSnapshots)
        .where(eq(searchTermsSnapshots.id, snapshotId))
        .limit(1);

    return snapshot ? mapSnapshot(snapshot) : null;
};

export const getLatestSearchTermsSnapshot = async (window: SearchTermsWindow) => {
    const [snapshot] = await db
        .select()
        .from(searchTermsSnapshots)
        .where(
            and(
                eq(searchTermsSnapshots.marketplaceId, window.marketplaceId),
                eq(searchTermsSnapshots.reportPeriod, window.reportPeriod),
                eq(searchTermsSnapshots.dataStartDate, window.dataStartDate),
                eq(searchTermsSnapshots.dataEndDate, window.dataEndDate)
            )
        )
        .orderBy(desc(searchTermsSnapshots.fetchedAt))
        .limit(1);

    return snapshot ? mapSnapshot(snapshot) : null;
};

export const listSearchTermsKeywords = async ({
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
    const filters = [eq(searchTermsKeywordDaily.snapshotId, snapshotId)];
    if (minRank) {
        filters.push(gte(searchTermsKeywordDaily.searchFrequencyRank, minRank));
    }
    if (maxRank) {
        filters.push(lte(searchTermsKeywordDaily.searchFrequencyRank, maxRank));
    }
    if (merchOnly) {
        filters.push(eq(searchTermsKeywordDaily.isMerchRelevant, true));
    }
    if (search) {
        filters.push(ilike(searchTermsKeywordDaily.searchTerm, `%${search}%`));
    }

    const whereClause = and(...filters);
    const [countRows, itemRows] = await Promise.all([
        db
            .select({
                totalFiltered: sql<number>`count(*)::int`,
            })
            .from(searchTermsKeywordDaily)
            .where(whereClause),
        db
            .select({
                searchTerm: searchTermsKeywordDaily.searchTerm,
                searchFrequencyRank: searchTermsKeywordDaily.searchFrequencyRank,
                clickShareTop3SumBasisPoints: searchTermsKeywordDaily.clickShareTop3SumBasisPoints,
                conversionShareTop3SumBasisPoints:
                    searchTermsKeywordDaily.conversionShareTop3SumBasisPoints,
                topRowsCount: searchTermsKeywordDaily.topRowsCount,
                isMerchRelevant: searchTermsKeywordDaily.isMerchRelevant,
                merchReason: searchTermsKeywordDaily.merchReason,
            })
            .from(searchTermsKeywordDaily)
            .where(whereClause)
            .orderBy(
                asc(searchTermsKeywordDaily.searchFrequencyRank),
                asc(searchTermsKeywordDaily.searchTerm)
            )
            .offset(cursor)
            .limit(limit),
    ]);

    const totalFiltered = countRows[0]?.totalFiltered ?? 0;
    const items = itemRows.map(mapKeywordListRow);
    const nextCursor = cursor + limit < totalFiltered ? cursor + limit : null;

    return {
        items,
        nextCursor,
        totalFiltered,
    };
};

const mapSnapshot = (
    row: typeof searchTermsSnapshots.$inferSelect
): SearchTermsSnapshotRecord => {
    return {
        createdAt: row.createdAt.toISOString(),
        dataEndDate: row.dataEndDate,
        dataStartDate: row.dataStartDate,
        fetchedAt: row.fetchedAt.toISOString(),
        id: row.id,
        keywordCount: row.keywordCount,
        marketplaceId: row.marketplaceId,
        observedDate: row.observedDate,
        reportId: row.reportId,
        reportPeriod: row.reportPeriod,
        sourceJobId: row.sourceJobId,
        updatedAt: row.updatedAt.toISOString(),
    };
};

const mapKeywordListRow = (row: {
    searchTerm: string;
    searchFrequencyRank: number;
    clickShareTop3SumBasisPoints: number;
    conversionShareTop3SumBasisPoints: number;
    topRowsCount: number;
    isMerchRelevant: boolean;
    merchReason: string;
}): SearchTermsKeywordListRow => {
    return {
        clickShareTop3Sum: row.clickShareTop3SumBasisPoints / 10000,
        conversionShareTop3Sum: row.conversionShareTop3SumBasisPoints / 10000,
        isMerchRelevant: row.isMerchRelevant,
        merchReason: row.merchReason,
        searchFrequencyRank: row.searchFrequencyRank,
        searchTerm: row.searchTerm,
        topRowsCount: row.topRowsCount,
    };
};

const toBasisPoints = (value: number) => Math.round(value * 10000);

const chunkRows = <T>(values: T[], chunkSize: number): T[][] => {
    if (values.length === 0) {
        return [];
    }

    if (values.length <= chunkSize) {
        return [values];
    }

    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += chunkSize) {
        chunks.push(values.slice(index, index + chunkSize));
    }

    return chunks;
};
