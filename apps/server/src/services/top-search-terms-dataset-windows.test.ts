import { describe, expect, it } from 'bun:test';
import {
    buildDailyTopSearchTermsWindows,
    buildWeeklyTopSearchTermsWindows,
    getDailyRetentionCutoffDate,
    getNextRefreshAtAfterSuccess,
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
    it('keeps refreshing current day/week datasets', () => {
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

        expect(dayRefresh?.toISOString()).toBe('2026-03-03T18:00:00.000Z');
        expect(weekRefresh?.toISOString()).toBe('2026-03-04T00:00:00.000Z');
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
