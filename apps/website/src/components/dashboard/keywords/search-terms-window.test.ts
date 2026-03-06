import { describe, expect, it } from 'bun:test';
import {
    EMPTY_CUSTOM_WINDOW_ERROR,
    INVALID_CUSTOM_WINDOW_ERROR,
    resolveSearchTermsListWindow,
} from '@/components/dashboard/keywords/search-terms-window';

describe('resolveSearchTermsListWindow', () => {
    it('returns latest day window for latest-day preset', () => {
        const resolved = resolveSearchTermsListWindow({
            selection: 'latest-day',
            customRange: null,
        });

        expect(resolved).toEqual({
            customWindowError: null,
            input: { reportPeriod: 'DAY' },
        });
    });

    it('returns weekly window for last-complete-week preset', () => {
        const resolved = resolveSearchTermsListWindow({
            selection: 'last-complete-week',
            customRange: null,
        });

        expect(resolved).toEqual({
            customWindowError: null,
            input: { reportPeriod: 'WEEK' },
        });
    });

    it('returns custom daily window for a single selected day', () => {
        const resolved = resolveSearchTermsListWindow({
            selection: 'custom',
            customRange: [new Date(2026, 2, 5), new Date(2026, 2, 5)],
        });

        expect(resolved).toEqual({
            customWindowError: null,
            input: {
                reportPeriod: 'DAY',
                dataStartDate: '2026-03-05',
                dataEndDate: '2026-03-05',
            },
        });
    });

    it('returns custom weekly window for a full Sunday-Saturday range', () => {
        const resolved = resolveSearchTermsListWindow({
            selection: 'custom',
            customRange: [new Date(2026, 2, 1), new Date(2026, 2, 7)],
        });

        expect(resolved).toEqual({
            customWindowError: null,
            input: {
                reportPeriod: 'WEEK',
                dataStartDate: '2026-03-01',
                dataEndDate: '2026-03-07',
            },
        });
    });

    it('normalizes reversed custom dates before resolving the window', () => {
        const resolved = resolveSearchTermsListWindow({
            selection: 'custom',
            customRange: [new Date(2026, 2, 7), new Date(2026, 2, 1)],
        });

        expect(resolved).toEqual({
            customWindowError: null,
            input: {
                reportPeriod: 'WEEK',
                dataStartDate: '2026-03-01',
                dataEndDate: '2026-03-07',
            },
        });
    });

    it('returns an error for unsupported custom multi-day windows', () => {
        const resolved = resolveSearchTermsListWindow({
            selection: 'custom',
            customRange: [new Date(2026, 2, 3), new Date(2026, 2, 8)],
        });

        expect(resolved).toEqual({
            customWindowError: INVALID_CUSTOM_WINDOW_ERROR,
            input: null,
        });
    });

    it('returns an error when custom is selected without a range', () => {
        const resolved = resolveSearchTermsListWindow({
            selection: 'custom',
            customRange: null,
        });

        expect(resolved).toEqual({
            customWindowError: EMPTY_CUSTOM_WINDOW_ERROR,
            input: null,
        });
    });
});
