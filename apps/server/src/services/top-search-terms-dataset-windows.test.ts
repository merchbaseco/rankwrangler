import { describe, expect, it } from 'bun:test';
import {
    buildDailyTopSearchTermsWindows,
    buildWeeklyTopSearchTermsWindows,
    getDailyRetentionCutoffDate,
    getInitialNextRefreshAtForWindow,
    getNextRefreshAtAfterSuccess,
    TOP_SEARCH_TERMS_SCHEDULER_BATCH_SIZE,
} from '@/services/top-search-terms-dataset-windows.js';

describe('buildDailyTopSearchTermsWindows', () => {
    it('builds descending day windows including today', () => {
        const windows = buildDailyTopSearchTermsWindows({
            marketplaceId: 'ATVPDKIKX0DER',
            today: '2026-03-03',
            days: 3,
        });

        expect(windows).toEqual([
            {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'DAY',
                dataStartDate: '2026-03-03',
                dataEndDate: '2026-03-03',
            },
            {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'DAY',
                dataStartDate: '2026-03-02',
                dataEndDate: '2026-03-02',
            },
            {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'DAY',
                dataStartDate: '2026-03-01',
                dataEndDate: '2026-03-01',
            },
        ]);
    });
});

describe('buildWeeklyTopSearchTermsWindows', () => {
    it('anchors to monday-start weeks', () => {
        const windows = buildWeeklyTopSearchTermsWindows({
            marketplaceId: 'ATVPDKIKX0DER',
            today: '2026-03-03',
            weeks: 2,
        });

        expect(windows).toEqual([
            {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'WEEK',
                dataStartDate: '2026-03-02',
                dataEndDate: '2026-03-08',
            },
            {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'WEEK',
                dataStartDate: '2026-02-23',
                dataEndDate: '2026-03-01',
            },
        ]);
    });
});

describe('getDailyRetentionCutoffDate', () => {
    it('returns oldest retained date for deletion cutoff', () => {
        expect(
            getDailyRetentionCutoffDate({
                today: '2026-03-03',
                retentionDays: 90,
            })
        ).toBe('2025-12-04');
    });
});

describe('getNextRefreshAtAfterSuccess', () => {
    it('uses SLA-aligned Pacific 3AM refresh windows for open datasets', () => {
        const now = new Date('2026-03-03T12:00:00.000Z');
        const dayRefresh = getNextRefreshAtAfterSuccess({
            dataset: {
                reportPeriod: 'DAY',
                dataEndDate: '2026-03-03',
            },
            now,
            today: '2026-03-03',
        });
        const weekRefresh = getNextRefreshAtAfterSuccess({
            dataset: {
                reportPeriod: 'WEEK',
                dataEndDate: '2026-03-08',
            },
            now,
            today: '2026-03-03',
        });

        expect(dayRefresh?.toISOString()).toBe('2026-03-07T11:00:00.000Z');
        expect(weekRefresh?.toISOString()).toBe('2026-03-11T10:00:00.000Z');
    });

    it('uses saturday-specific daily SLA timing', () => {
        const now = new Date('2026-03-07T18:00:00.000Z');
        const dayRefresh = getNextRefreshAtAfterSuccess({
            dataset: {
                reportPeriod: 'DAY',
                dataEndDate: '2026-03-07',
            },
            now,
            today: '2026-03-07',
        });

        expect(dayRefresh?.toISOString()).toBe('2026-03-10T10:00:00.000Z');
    });

    it('stops refreshing closed periods', () => {
        const now = new Date('2026-03-03T12:00:00.000Z');
        expect(
            getNextRefreshAtAfterSuccess({
                dataset: {
                    reportPeriod: 'DAY',
                    dataEndDate: '2026-03-02',
                },
                now,
                today: '2026-03-03',
            })
        ).toBeNull();
        expect(
            getNextRefreshAtAfterSuccess({
                dataset: {
                    reportPeriod: 'WEEK',
                    dataEndDate: '2026-03-01',
                },
                now,
                today: '2026-03-03',
            })
        ).toBeNull();
    });
});

describe('getInitialNextRefreshAtForWindow', () => {
    it('defers open windows until SLA-aligned refresh slots', () => {
        const now = new Date('2026-03-03T20:00:00.000Z');
        const nextRefreshAt = getInitialNextRefreshAtForWindow({
            window: {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'DAY',
                dataStartDate: '2026-03-03',
                dataEndDate: '2026-03-03',
            },
            now,
            today: '2026-03-03',
        });

        expect(nextRefreshAt.toISOString()).toBe('2026-03-07T11:00:00.000Z');
    });

    it('queues closed windows immediately for backfill', () => {
        const now = new Date('2026-03-03T20:00:00.000Z');
        const nextRefreshAt = getInitialNextRefreshAtForWindow({
            window: {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'DAY',
                dataStartDate: '2026-03-02',
                dataEndDate: '2026-03-02',
            },
            now,
            today: '2026-03-03',
        });

        expect(nextRefreshAt.toISOString()).toBe(now.toISOString());
    });
});

describe('TOP_SEARCH_TERMS_SCHEDULER_BATCH_SIZE', () => {
    it('limits scheduler enqueueing to five datasets per run', () => {
        expect(TOP_SEARCH_TERMS_SCHEDULER_BATCH_SIZE).toBe(5);
    });
});
