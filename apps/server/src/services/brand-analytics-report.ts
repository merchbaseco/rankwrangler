import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { z } from 'zod';
import { createSpApiProvider } from '@/services/providers/sp-api/sp-api-provider';
import { readBrandAnalyticsRows } from './brand-analytics-report-parser';
import {
    BRAND_ANALYTICS_MARKETPLACE_ID,
    createBrandAnalyticsAccumulator,
} from './brand-analytics-terms';

// SP-API Reports calls for the weekly Brand Analytics search terms report. Each is one provider
// call; the import job sequences them durably.
export const requestBrandAnalyticsReport = async (week: { weekStart: string; weekEnd: string }) => {
    const response = createReportSchema.parse(
        await createSpApiProvider().createReport({
            reportType: 'GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT',
            marketplaceIds: [BRAND_ANALYTICS_MARKETPLACE_ID],
            dataStartTime: `${week.weekStart}T00:00:00Z`,
            dataEndTime: `${week.weekEnd}T23:59:59Z`,
            reportOptions: { reportPeriod: 'WEEK' },
        })
    );
    return response.reportId;
};

export const readBrandAnalyticsReport = async (reportId: string) => {
    const report = getReportSchema.parse(await createSpApiProvider().getReport(reportId));
    return {
        processingStatus: report.processingStatus,
        reportDocumentId: report.reportDocumentId ?? null,
    };
};

// Downloads the report document and aggregates it while streaming; returns only the kept terms.
export const downloadBrandAnalyticsTerms = async (reportDocumentId: string) => {
    const provider = createSpApiProvider();
    const document = documentSchema.parse(await provider.getReportDocument(reportDocumentId));
    const response = await provider.downloadReportDocument({
        url: document.url,
        timeoutMs: downloadTimeoutMs,
    });
    if (!response.body) throw new Error('Brand Analytics report document has no body');
    const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    const stream =
        document.compressionAlgorithm?.toUpperCase() === 'GZIP'
            ? source.pipe(createGunzip())
            : source;
    const accumulator = createBrandAnalyticsAccumulator();
    await readBrandAnalyticsRows(stream, accumulator.add);
    return accumulator.finish();
};

// Time to receive the document's response headers; streaming the body is not cut off.
const downloadTimeoutMs = 120_000;
const createReportSchema = z.object({ reportId: z.string().min(1) });
const getReportSchema = z.object({
    processingStatus: z.string(),
    reportDocumentId: z.string().nullish(),
});
const documentSchema = z.object({
    url: z.url(),
    compressionAlgorithm: z.string().nullish(),
});
