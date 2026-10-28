import { describe, expect, it, mock } from 'bun:test';
import type { BrandAnalyticsImportWork } from '@/db/brand-analytics-imports';
import { advanceBrandAnalyticsImport } from './brand-analytics-import';

const work = (patch: Partial<BrandAnalyticsImportWork>): BrandAnalyticsImportWork =>
    ({
        id: 'import',
        marketplaceId: 'ATVPDKIKX0DER',
        weekStart: '2026-10-18',
        weekEnd: '2026-10-24',
        status: 'pending',
        reportId: null,
        reportDocumentId: null,
        reportStatus: null,
        failureCount: 0,
        claimToken: 'token',
        ...patch,
    }) as BrandAnalyticsImportWork;

const deps = (claimed: BrandAnalyticsImportWork | null, report = 'DONE') => ({
    claim: mock(async () => claimed),
    release: mock(async () => undefined),
    request: mock(async () => 'report-1'),
    read: mock(async () => ({ processingStatus: report, reportDocumentId: 'document-1' })),
    download: mock(async () => ({ rows: 9, terms: 3, kept: [] })),
    save: mock(async () => ({ newTerms: 0 })),
});

describe('Brand Analytics import steps', () => {
    it('does nothing when the import is not due or the pipeline is paused', async () => {
        const d = deps(null);
        expect(await advanceBrandAnalyticsImport('import', d as never)).toEqual({
            kind: 'notDue',
            didWork: false,
        });
        expect(d.request).not.toHaveBeenCalled();
    });
    it('requests the week and polls it later', async () => {
        const d = deps(work({}));
        expect(await advanceBrandAnalyticsImport('import', d as never)).toMatchObject({
            kind: 'requested',
            reportId: 'report-1',
        });
        expect(d.release.mock.calls[0][1]).toMatchObject({
            status: 'requested',
            reportId: 'report-1',
        });
    });
    it('keeps polling while Amazon generates the report', async () => {
        const d = deps(work({ status: 'requested', reportId: 'report-1' }), 'IN_PROGRESS');
        expect(await advanceBrandAnalyticsImport('import', d as never)).toMatchObject({
            kind: 'processing',
            didWork: false,
        });
        expect(d.release.mock.calls[0][1]).toMatchObject({ reportStatus: 'IN_PROGRESS' });
    });
    it('marks a finished report ready for its download step', async () => {
        const d = deps(work({ status: 'requested', reportId: 'report-1' }));
        await advanceBrandAnalyticsImport('import', d as never);
        expect(d.release.mock.calls[0][1]).toMatchObject({
            status: 'ready',
            reportDocumentId: 'document-1',
        });
        expect(d.download).not.toHaveBeenCalled();
    });
    it('requests a cancelled week again later', async () => {
        const d = deps(work({ status: 'requested', reportId: 'report-1' }), 'CANCELLED');
        await advanceBrandAnalyticsImport('import', d as never);
        expect(d.release.mock.calls[0][1]).toMatchObject({
            status: 'pending',
            reportId: null,
            failureCount: 1,
        });
    });
    it('downloads and saves a ready report', async () => {
        const d = deps(work({ status: 'ready', reportDocumentId: 'document-1' }));
        expect(await advanceBrandAnalyticsImport('import', d as never)).toMatchObject({
            kind: 'imported',
            rows: 9,
            keptTerms: 0,
        });
        expect(d.save).toHaveBeenCalledTimes(1);
    });
    it('backs off and restarts a document that keeps failing', async () => {
        const d = deps(work({ status: 'ready', reportDocumentId: 'document-1', failureCount: 2 }));
        d.download.mockImplementation(async () => {
            throw new Error('stream reset');
        });
        await expect(advanceBrandAnalyticsImport('import', d as never)).rejects.toThrow(
            'stream reset'
        );
        expect(d.release.mock.calls[0][1]).toMatchObject({
            status: 'pending',
            failureCount: 3,
            lastError: 'stream reset',
        });
    });
});
