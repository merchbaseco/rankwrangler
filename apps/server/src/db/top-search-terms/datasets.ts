import { and, asc, desc, eq, isNotNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import {
    mapDatasetRecord,
    type TopSearchTermsDatasetRecord,
} from '@/db/top-search-terms/dataset-record.js';
import { topSearchTermsDatasets } from '@/db/top-search-terms-schema.js';
import type { TopSearchTermsDatasetStatus, TopSearchTermsWindow } from '@/db/top-search-terms/types.js';

export const getTopSearchTermsDatasetByWindow = async (
    window: TopSearchTermsWindow
): Promise<TopSearchTermsDatasetRecord | null> => {
    const [row] = await db
        .select()
        .from(topSearchTermsDatasets)
        .where(getDatasetWindowWhere(window))
        .limit(1);

    return row ? mapDatasetRecord(row) : null;
};

export const getTopSearchTermsDatasetById = async (
    datasetId: string
): Promise<TopSearchTermsDatasetRecord | null> => {
    const [row] = await db
        .select()
        .from(topSearchTermsDatasets)
        .where(eq(topSearchTermsDatasets.id, datasetId))
        .limit(1);

    return row ? mapDatasetRecord(row) : null;
};

export const getLatestTopSearchTermsDataset = async ({
    marketplaceId,
    reportPeriod,
    status,
}: {
    marketplaceId: string;
    reportPeriod: TopSearchTermsWindow['reportPeriod'];
    status?: TopSearchTermsDatasetStatus;
}): Promise<TopSearchTermsDatasetRecord | null> => {
    const filters = [
        eq(topSearchTermsDatasets.marketplaceId, marketplaceId),
        eq(topSearchTermsDatasets.reportPeriod, reportPeriod),
    ];

    if (status) {
        filters.push(eq(topSearchTermsDatasets.status, status));
    }

    const [row] = await db
        .select()
        .from(topSearchTermsDatasets)
        .where(and(...filters))
        .orderBy(desc(topSearchTermsDatasets.dataEndDate), desc(topSearchTermsDatasets.updatedAt))
        .limit(1);

    return row ? mapDatasetRecord(row) : null;
};

export const ensureTopSearchTermsDataset = async ({
    window,
    nextRefreshAt = new Date(),
}: {
    window: TopSearchTermsWindow;
    nextRefreshAt?: Date | null;
}) => {
    const [row] = await db
        .insert(topSearchTermsDatasets)
        .values({
            marketplaceId: window.marketplaceId,
            reportPeriod: window.reportPeriod,
            dataStartDate: window.dataStartDate,
            dataEndDate: window.dataEndDate,
            nextRefreshAt,
        })
        .onConflictDoUpdate({
            target: [
                topSearchTermsDatasets.marketplaceId,
                topSearchTermsDatasets.reportPeriod,
                topSearchTermsDatasets.dataStartDate,
                topSearchTermsDatasets.dataEndDate,
            ],
            set: {
                updatedAt: new Date(),
            },
        })
        .returning();

    return mapDatasetRecord(row);
};

export const insertMissingTopSearchTermsDatasets = async ({
    windows,
    getNextRefreshAt = () => new Date(),
}: {
    windows: TopSearchTermsWindow[];
    getNextRefreshAt?: (window: TopSearchTermsWindow) => Date | null;
}) => {
    if (windows.length === 0) {
        return 0;
    }

    const inserted = await db
        .insert(topSearchTermsDatasets)
        .values(
            windows.map(window => ({
                marketplaceId: window.marketplaceId,
                reportPeriod: window.reportPeriod,
                dataStartDate: window.dataStartDate,
                dataEndDate: window.dataEndDate,
                nextRefreshAt: getNextRefreshAt(window),
            }))
        )
        .onConflictDoNothing()
        .returning({ id: topSearchTermsDatasets.id });

    return inserted.length;
};

export const deleteTopSearchTermsDailyDatasetsBefore = async ({
    marketplaceId,
    cutoffDateExclusive,
}: {
    marketplaceId: string;
    cutoffDateExclusive: string;
}) => {
    const deleted = await db
        .delete(topSearchTermsDatasets)
        .where(
            and(
                eq(topSearchTermsDatasets.marketplaceId, marketplaceId),
                eq(topSearchTermsDatasets.reportPeriod, 'DAY'),
                sql`${topSearchTermsDatasets.dataEndDate} < ${cutoffDateExclusive}`
            )
        )
        .returning({ id: topSearchTermsDatasets.id });

    return deleted.length;
};

export const listDueTopSearchTermsDatasets = async ({
    marketplaceId,
    now = new Date(),
    limit,
    staleActiveJobCutoff,
}: {
    marketplaceId: string;
    now?: Date;
    limit: number;
    staleActiveJobCutoff?: Date;
}) => {
    const refreshingEligibilityFilter = staleActiveJobCutoff
        ? or(
              eq(topSearchTermsDatasets.refreshing, false),
              and(
                  eq(topSearchTermsDatasets.refreshing, true),
                  isNotNull(topSearchTermsDatasets.activeJobRequestedAt),
                  lte(topSearchTermsDatasets.activeJobRequestedAt, staleActiveJobCutoff)
              )
          )
        : eq(topSearchTermsDatasets.refreshing, false);

    const rows = await db
        .select()
        .from(topSearchTermsDatasets)
        .where(
            and(
                eq(topSearchTermsDatasets.marketplaceId, marketplaceId),
                refreshingEligibilityFilter,
                lte(topSearchTermsDatasets.nextRefreshAt, now)
            )
        )
        .orderBy(
            asc(topSearchTermsDatasets.nextRefreshAt),
            asc(topSearchTermsDatasets.updatedAt)
        )
        .limit(limit);

    return rows.map(mapDatasetRecord);
};

export const recoverStaleTopSearchTermsDatasets = async ({
    marketplaceId,
    staleActiveJobCutoff,
    recoveredAt = new Date(),
    recoveryErrorMessage = 'Recovered stale Top Search Terms active job during server startup.',
}: {
    marketplaceId: string;
    staleActiveJobCutoff: Date;
    recoveredAt?: Date;
    recoveryErrorMessage?: string;
}) => {
    const recovered = await db
        .update(topSearchTermsDatasets)
        .set({
            activeJobId: null,
            lastError: recoveryErrorMessage,
            lastFailedAt: recoveredAt,
            nextRefreshAt: recoveredAt,
            refreshing: false,
            status: 'failed',
            updatedAt: recoveredAt,
        })
        .where(
            and(
                eq(topSearchTermsDatasets.marketplaceId, marketplaceId),
                eq(topSearchTermsDatasets.refreshing, true),
                isNotNull(topSearchTermsDatasets.activeJobRequestedAt),
                lte(topSearchTermsDatasets.activeJobRequestedAt, staleActiveJobCutoff)
            )
        )
        .returning({ id: topSearchTermsDatasets.id });

    return recovered.length;
};

const getDatasetWindowWhere = (window: TopSearchTermsWindow) =>
    and(
        eq(topSearchTermsDatasets.marketplaceId, window.marketplaceId),
        eq(topSearchTermsDatasets.reportPeriod, window.reportPeriod),
        eq(topSearchTermsDatasets.dataStartDate, window.dataStartDate),
        eq(topSearchTermsDatasets.dataEndDate, window.dataEndDate)
    );
