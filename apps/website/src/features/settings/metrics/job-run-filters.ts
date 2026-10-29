/**
 * Which job runs a metrics page lists under its stat tiles. Each family is the
 * job names behind one provider's tiles; the outcome narrows to the runs one
 * tile counts. Labels match the server's stat series (`getAdminStats`).
 */
type JobFamily = 'keepa' | 'spapi';
export type JobOutcome = 'all' | 'success' | 'failed';

export interface JobRunFilter {
    readonly jobNames: readonly string[];
    readonly status?: 'success' | 'failed';
}

export const jobFamilies: Readonly<
    Record<
        JobFamily,
        { readonly jobNames: readonly string[]; readonly statLabels: Record<JobOutcome, string> }
    >
> = {
    keepa: {
        jobNames: ['fetch-keepa-history-for-asin', 'enqueue-scheduled-keepa-history-refresh'],
        statLabels: { all: 'Keepa Fetches', failed: 'Job Failures', success: 'Job Successes' },
    },
    spapi: {
        jobNames: ['process-spapi-sync-queue'],
        statLabels: {
            all: 'SP-API Jobs Run',
            failed: 'SP-API Jobs Failed',
            success: 'SP-API Jobs Success',
        },
    },
};

/** The keyword collection jobs the Keyword jobs tab lists (server `keywordQueues`). */
export const keywordJobNames = [
    'schedule-keyword-work',
    'scan-keyword',
    'autocomplete-keyword',
    'import-brand-analytics',
] as const;

export const jobRunFilter = (jobNames: readonly string[], outcome: JobOutcome): JobRunFilter =>
    outcome === 'all' ? { jobNames } : { jobNames, status: outcome };

/** The tile's tone: successes read green, failures red, totals neutral. */
export const outcomeOfStat = (label: string): JobOutcome => {
    if (label.includes('Success')) {
        return 'success';
    }
    if (label.includes('Fail') || label.includes('Error')) {
        return 'failed';
    }
    return 'all';
};

export const withTimeDomainLabel = (label: string, timeDomainLabel: string | undefined) =>
    timeDomainLabel === undefined || timeDomainLabel.trim().length === 0
        ? label
        : `${label} (${timeDomainLabel})`;
