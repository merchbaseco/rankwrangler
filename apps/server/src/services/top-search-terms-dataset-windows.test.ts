import { describe, expect, it } from 'bun:test';
import {
    buildDailyTopSearchTermsWindows,
    buildWeeklyTopSearchTermsWindows,
    getDailyRetentionCutoffDate,
    getInitialNextRefreshAtForWindow,
    getNextRefreshAtAfterSuccess,
    getRetryRefreshAt,
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
    it('anchors to sunday-start weeks', () => {
        const windows = buildWeeklyTopSearchTermsWindows({
            marketplaceId: 'ATVPDKIKX0DER',
            today: '2026-03-03',
            weeks: 2,
        });

        expect(windows).toEqual([
            {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'WEEK',
                dataStartDate: '2026-03-01',
                dataEndDate: '2026-03-07',
            },
            {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'WEEK',
                dataStartDate: '2026-02-22',
                dataEndDate: '2026-02-28',
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
    it('uses BA SLA cutoff timestamps for open datasets', () => {
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
                dataEndDate: '2026-03-07',
            },
            now,
            today: '2026-03-03',
        });

        expect(dayRefresh?.toISOString()).toBe('2026-03-07T07:59:59.999Z');
        expect(weekRefresh?.toISOString()).toBe('2026-03-10T06:59:59.999Z');
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

        expect(dayRefresh?.toISOString()).toBe('2026-03-10T06:59:59.999Z');
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
                    dataEndDate: '2026-02-28',
                },
                now,
                today: '2026-03-03',
            })
        ).toBeNull();
    });
});

describe('getInitialNextRefreshAtForWindow', () => {
    it('defers open windows until the BA SLA boundary', () => {
        const now = new Date('2026-03-03T20:00:00.000Z');
        const nextRefreshAt = getInitialNextRefreshAtForWindow({
            window: {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'DAY',
                dataStartDate: '2026-03-03',
                dataEndDate: '2026-03-03',
            },
            now,
        });

        expect(nextRefreshAt.toISOString()).toBe('2026-03-07T07:59:59.999Z');
    });

    it('waits for recently closed windows to reach the BA availability boundary', () => {
        const now = new Date('2026-03-26T20:00:00.000Z');
        const nextRefreshAt = getInitialNextRefreshAtForWindow({
            window: {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'DAY',
                dataStartDate: '2026-03-24',
                dataEndDate: '2026-03-24',
            },
            now,
        });

        expect(nextRefreshAt.toISOString()).toBe('2026-03-28T06:59:59.999Z');
    });

    it('queues overdue historical windows immediately once the BA boundary has passed', () => {
        const now = new Date('2026-03-26T20:00:00.000Z');
        const nextRefreshAt = getInitialNextRefreshAtForWindow({
            window: {
                marketplaceId: 'ATVPDKIKX0DER',
                reportPeriod: 'DAY',
                dataStartDate: '2026-03-20',
                dataEndDate: '2026-03-20',
            },
            now,
        });

        expect(nextRefreshAt.toISOString()).toBe(now.toISOString());
    });
});

describe('getRetryRefreshAt', () => {
    it('does not retry before the BA availability boundary', () => {
        const failedAt = new Date('2026-03-26T18:20:25.511Z');
        const nextRefreshAt = getRetryRefreshAt({
            dataset: {
                reportPeriod: 'DAY',
                dataEndDate: '2026-03-24',
            },
            failedAt,
        });

        expect(nextRefreshAt.toISOString()).toBe('2026-03-28T06:59:59.999Z');
    });

    it('keeps the standard retry delay after the BA availability boundary', () => {
        const failedAt = new Date('2026-03-29T18:20:25.511Z');
        const nextRefreshAt = getRetryRefreshAt({
            dataset: {
                reportPeriod: 'DAY',
                dataEndDate: '2026-03-24',
            },
            failedAt,
        });

        expect(nextRefreshAt.toISOString()).toBe('2026-03-29T18:50:25.511Z');
    });
});

describe('TOP_SEARCH_TERMS_SCHEDULER_BATCH_SIZE', () => {
    it('limits scheduler enqueueing to five datasets per run', () => {
        expect(TOP_SEARCH_TERMS_SCHEDULER_BATCH_SIZE).toBe(5);
    });
});
