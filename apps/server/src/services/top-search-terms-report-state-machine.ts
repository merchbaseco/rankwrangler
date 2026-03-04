export const TOP_SEARCH_TERMS_REPORT_RECHECK_DELAY_MS = 15 * 60 * 1000;
export const TOP_SEARCH_TERMS_REPORT_MAX_PENDING_MS = 3 * 60 * 60 * 1000;

export type TopSearchTermsReportAction =
    | {
          type: 'create_report';
      }
    | {
          type: 'check_later';
      }
    | {
          type: 'process_report';
          reportDocumentId: string;
      }
    | {
          type: 'fail_terminal';
          reason: string;
      };

export const getTopSearchTermsReportAction = ({
    reportId,
    reportStatus,
    reportDocumentId,
}: {
    reportId: string | null;
    reportStatus: string | null;
    reportDocumentId: string | null;
}): TopSearchTermsReportAction => {
    if (!reportId) {
        return {
            type: 'create_report',
        };
    }

    const status = String(reportStatus ?? 'UNKNOWN');
    if (status === 'DONE') {
        if (!reportDocumentId) {
            return {
                type: 'fail_terminal',
                reason: `BA report ${reportId} completed without a reportDocumentId.`,
            };
        }

        return {
            type: 'process_report',
            reportDocumentId,
        };
    }

    if (status === 'FATAL' || status === 'CANCELLED') {
        return {
            type: 'fail_terminal',
            reason: `BA report ${reportId} ended with status ${status}.`,
        };
    }

    return {
        type: 'check_later',
    };
};

export const getTopSearchTermsReportRecheckAt = (now: Date = new Date()) => {
    return new Date(now.getTime() + TOP_SEARCH_TERMS_REPORT_RECHECK_DELAY_MS);
};

export const isTopSearchTermsReportPendingTimedOut = ({
    pendingSince,
    now = new Date(),
}: {
    pendingSince: Date;
    now?: Date;
}) => {
    return now.getTime() - pendingSince.getTime() >= TOP_SEARCH_TERMS_REPORT_MAX_PENDING_MS;
};
