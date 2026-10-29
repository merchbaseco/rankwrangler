import {
    type BrandAnalyticsImportWork,
    claimBrandAnalyticsImport,
    releaseBrandAnalyticsImport,
    saveBrandAnalyticsImport,
} from '@/db/brand-analytics-imports';
import {
    downloadBrandAnalyticsTerms,
    readBrandAnalyticsReport,
    requestBrandAnalyticsReport,
} from './brand-analytics-report';

// Amazon took one to ten minutes to generate a weekly report in the POC; poll every two.
export const BRAND_ANALYTICS_POLL_MS = 2 * 60_000;

const defaults = {
    claim: claimBrandAnalyticsImport,
    release: releaseBrandAnalyticsImport,
    request: requestBrandAnalyticsReport,
    read: readBrandAnalyticsReport,
    download: downloadBrandAnalyticsTerms,
    save: saveBrandAnalyticsImport,
};

// Advances one weekly import by one step, each a single provider call: request the report, check
// its status, or download, aggregate and save it. Unfinished steps return a followup time, and the
// job queues itself again for it; a failed step waits for its backoff and the six-hour check.
export const advanceBrandAnalyticsImport = async (importId: string, deps = defaults) => {
    const now = new Date();
    const work = await deps.claim(importId, now);
    if (!work) return { kind: 'notDue' as const, didWork: false };
    try {
        switch (work.status) {
            case 'pending':
                return await requestReport(work, deps, now);
            case 'requested':
                return await checkReport(work, deps, now);
            case 'ready':
                return await importReport(work, deps, now);
            case 'imported':
            case 'superseded':
                await deps.release(work, {}, now);
                return { kind: 'notDue' as const, didWork: false };
            default:
                return assertNever(work.status);
        }
    } catch (error) {
        const failureCount = work.failureCount + 1;
        // A document that keeps failing to import is requested afresh rather than retried forever.
        const restart = work.status === 'ready' && failureCount >= maxDocumentFailures;
        await deps.release(
            work,
            {
                failureCount,
                lastError: error instanceof Error ? error.message : String(error),
                nextAttemptAt: new Date(now.getTime() + failureBackoffMs(failureCount)),
                ...(restart ? { status: 'pending', reportId: null, reportDocumentId: null } : {}),
            },
            now
        );
        throw error;
    }
};

type Deps = typeof defaults;

const requestReport = async (work: BrandAnalyticsImportWork, deps: Deps, now: Date) => {
    const reportId = await deps.request(work);
    await deps.release(
        work,
        {
            status: 'requested',
            reportId,
            reportStatus: null,
            requestedAt: now,
            nextAttemptAt: new Date(now.getTime() + BRAND_ANALYTICS_POLL_MS),
        },
        now
    );
    return {
        kind: 'requested' as const,
        didWork: true,
        weekStart: work.weekStart,
        reportId,
        followup: { at: new Date(now.getTime() + BRAND_ANALYTICS_POLL_MS) },
    };
};

const checkReport = async (work: BrandAnalyticsImportWork, deps: Deps, now: Date) => {
    if (!work.reportId) throw new Error('Requested Brand Analytics import has no report id');
    const report = await deps.read(work.reportId);
    const reportStatus = report.processingStatus;
    if (reportStatus === 'DONE' && report.reportDocumentId) {
        await deps.release(
            work,
            {
                status: 'ready',
                reportStatus,
                reportDocumentId: report.reportDocumentId,
                nextAttemptAt: now,
            },
            now
        );
        return {
            kind: 'ready' as const,
            didWork: true,
            weekStart: work.weekStart,
            followup: { at: now },
        };
    }
    if (reportStatus === 'IN_QUEUE' || reportStatus === 'IN_PROGRESS') {
        await deps.release(
            work,
            { reportStatus, nextAttemptAt: new Date(now.getTime() + BRAND_ANALYTICS_POLL_MS) },
            now
        );
        return {
            kind: 'processing' as const,
            didWork: false,
            weekStart: work.weekStart,
            followup: { at: new Date(now.getTime() + BRAND_ANALYTICS_POLL_MS) },
        };
    }
    // CANCELLED usually means Amazon has not published the week yet; FATAL is a failed report.
    // Either way the week is requested again later.
    const failureCount = work.failureCount + 1;
    const nextAttemptAt = new Date(now.getTime() + rerequestDelayMs(failureCount));
    await deps.release(
        work,
        {
            status: 'pending',
            reportStatus,
            reportId: null,
            failureCount,
            lastError: `Report ${work.reportId} ended ${reportStatus}`,
            nextAttemptAt,
        },
        now
    );
    return {
        kind: 'rerequest' as const,
        didWork: true,
        weekStart: work.weekStart,
        reportStatus,
        followup: { at: nextAttemptAt },
    };
};

const importReport = async (work: BrandAnalyticsImportWork, deps: Deps, now: Date) => {
    if (!work.reportDocumentId) throw new Error('Ready Brand Analytics import has no document');
    const result = await deps.download(work.reportDocumentId);
    const { newTerms } = await deps.save(work, result, new Date());
    return {
        kind: 'imported' as const,
        didWork: true,
        weekStart: work.weekStart,
        rows: result.rows,
        terms: result.terms,
        keptTerms: result.kept.length,
        newTerms,
        seconds: Math.round((Date.now() - now.getTime()) / 1000),
    };
};

const maxDocumentFailures = 3;
const hourMs = 3_600_000;
const failureBackoffMs = (failures: number) => Math.min(6 * hourMs, 5 * 60_000 * 2 ** failures);
const rerequestDelayMs = (failures: number) =>
    Math.min(48 * hourMs, 6 * hourMs * 2 ** (failures - 1));
const assertNever = (value: never): never => {
    throw new Error(`Unhandled Brand Analytics import status: ${String(value)}`);
};
