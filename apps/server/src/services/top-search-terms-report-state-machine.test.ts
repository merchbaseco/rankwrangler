import { describe, expect, it } from 'bun:test';
import {
    getTopSearchTermsReportAction,
    getTopSearchTermsReportRecheckAt,
    isTopSearchTermsReportPendingTimedOut,
    TOP_SEARCH_TERMS_REPORT_MAX_PENDING_MS,
    TOP_SEARCH_TERMS_REPORT_RECHECK_DELAY_MS,
} from '@/services/top-search-terms-report-state-machine.js';

describe('getTopSearchTermsReportAction', () => {
    it('requests a report when no report id exists', () => {
        const action = getTopSearchTermsReportAction({
            reportId: null,
            reportStatus: null,
            reportDocumentId: null,
        });

        expect(action).toEqual({
            type: 'create_report',
        });
    });

    it('waits when report is still processing', () => {
        const action = getTopSearchTermsReportAction({
            reportId: '102166020516',
            reportStatus: 'IN_PROGRESS',
            reportDocumentId: null,
        });

        expect(action).toEqual({
            type: 'check_later',
        });
    });

    it('processes when DONE with a document id', () => {
        const action = getTopSearchTermsReportAction({
            reportId: '102166020516',
            reportStatus: 'DONE',
            reportDocumentId: 'doc-1',
        });

        expect(action).toEqual({
            type: 'process_report',
            reportDocumentId: 'doc-1',
        });
    });

    it('fails terminally when DONE without a document id', () => {
        const action = getTopSearchTermsReportAction({
            reportId: '102166020516',
            reportStatus: 'DONE',
            reportDocumentId: null,
        });

        expect(action).toEqual({
            type: 'fail_terminal',
            reason: 'BA report 102166020516 completed without a reportDocumentId.',
        });
    });

    it('fails terminally for FATAL/CANCELLED statuses', () => {
        expect(
            getTopSearchTermsReportAction({
                reportId: '102166020516',
                reportStatus: 'FATAL',
                reportDocumentId: null,
            })
        ).toEqual({
            type: 'fail_terminal',
            reason: 'BA report 102166020516 ended with status FATAL.',
        });

        expect(
            getTopSearchTermsReportAction({
                reportId: '102166020516',
                reportStatus: 'CANCELLED',
                reportDocumentId: null,
            })
        ).toEqual({
            type: 'fail_terminal',
            reason: 'BA report 102166020516 ended with status CANCELLED.',
        });
    });
});

describe('getTopSearchTermsReportRecheckAt', () => {
    it('schedules next report status check after 15 minutes', () => {
        const now = new Date('2026-03-04T17:11:00.000Z');
        const nextRefreshAt = getTopSearchTermsReportRecheckAt(now);

        expect(nextRefreshAt.toISOString()).toBe('2026-03-04T17:26:00.000Z');
        expect(nextRefreshAt.getTime() - now.getTime()).toBe(
            TOP_SEARCH_TERMS_REPORT_RECHECK_DELAY_MS
        );
    });
});

describe('isTopSearchTermsReportPendingTimedOut', () => {
    it('returns false when report has been pending for less than 3 hours', () => {
        const pendingSince = new Date('2026-03-04T12:00:00.000Z');
        const now = new Date('2026-03-04T14:59:59.999Z');

        expect(isTopSearchTermsReportPendingTimedOut({ pendingSince, now })).toBeFalse();
    });

    it('returns true when report has been pending for 3 hours or more', () => {
        const pendingSince = new Date('2026-03-04T12:00:00.000Z');
        const now = new Date('2026-03-04T15:00:00.000Z');

        expect(now.getTime() - pendingSince.getTime()).toBe(TOP_SEARCH_TERMS_REPORT_MAX_PENDING_MS);
        expect(isTopSearchTermsReportPendingTimedOut({ pendingSince, now })).toBeTrue();
    });
});
