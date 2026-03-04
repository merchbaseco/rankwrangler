import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
// @ts-expect-error - SDK doesn't export types properly in package.json
import { ReportsSpApi } from '@amazon-sp-api-release/amazon-sp-api-sdk-js';
import Bottleneck from 'bottleneck';
import {
    isSupportedSpApiMarketplaceId,
    SPAPI_US_MARKETPLACE_ID,
} from '@/services/spapi/marketplaces.js';
import { createSpApiHttpError, runWithSpApiBackoff } from '@/services/spapi/spapi-backoff.js';
import { createSpApiClient } from '@/services/spapi/spapi-client.js';
import {
    addBaKeywordRowToAccumulator,
    createBaKeywordAccumulator,
    finalizeBaKeywordAccumulator,
    type BaKeywordRow,
    type RawBaSearchTermsRow,
} from '@/services/spapi/ba-keywords-aggregation.js';

export type BaReportPeriod = 'DAY' | 'WEEK';
export type BaKeywordsParams = {
    dataEndDate: string;
    dataStartDate: string;
    marketplaceId: string;
    reportPeriod: BaReportPeriod;
};
export type BaKeywordsSnapshot = {
    debug: BaKeywordsSnapshotDebug;
    dataEndDate: string;
    dataStartDate: string;
    fetchedAt: string;
    marketplaceId: string;
    reportId: string;
    reportPeriod: BaReportPeriod;
    rows: BaKeywordRow[];
};
export type BaKeywordsReportStatus = {
    processingStatus: string;
    reportDocumentId: string | null;
};
export type BaKeywordsSnapshotDebug = {
    acceptedTopRows: number;
    dataArrayDetected: boolean;
    emptySearchTermRows: number;
    invalidRankRows: number;
    keptKeywordCount: number;
    malformedObjectRows: number;
    parsedObjectRows: number;
    rejectedByReason: Record<string, number>;
};
const spApiClient = createSpApiClient();
const reportsApi = new ReportsSpApi.ReportsApi(spApiClient.reports);
const baReportsLimiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 500,
    reservoir: 2,
    reservoirRefreshAmount: 2,
    reservoirRefreshInterval: 1000,
});
const BA_REPORT_DOCUMENT_DOWNLOAD_TIMEOUT_MS = 120_000;
type SpApiCreateReportResponse = {
    reportId?: string | null;
};
type SpApiGetReportResponse = {
    processingStatus?: string | null;
    reportDocumentId?: string | null;
};
type SpApiReportDocumentResponse = {
    url: string;
    compressionAlgorithm?: string | null;
};
export const requestBaKeywordsReport = async (params: BaKeywordsParams) => {
    assertSupportedMarketplaceId(params.marketplaceId);
    return await createBaSearchTermsReport(params);
};

export const getBaKeywordsReportStatus = async (
    reportId: string
): Promise<BaKeywordsReportStatus> => {
    const report = (await runReportsApiCall({
        operation: `get BA report status (${reportId})`,
        run: async () => (await reportsApi.getReport(reportId)) as SpApiGetReportResponse,
    })) as SpApiGetReportResponse;

    return {
        processingStatus: String(report.processingStatus ?? 'UNKNOWN'),
        reportDocumentId: report.reportDocumentId ?? null,
    };
};

export const downloadBaKeywordsSnapshot = async ({
    params,
    reportDocumentId,
    reportId,
}: {
    params: BaKeywordsParams;
    reportDocumentId: string;
    reportId: string;
}): Promise<BaKeywordsSnapshot> => {
    assertSupportedMarketplaceId(params.marketplaceId);
    const document = (await runReportsApiCall({
        operation: `get BA report document (${reportDocumentId})`,
        run: async () =>
            (await reportsApi.getReportDocument(reportDocumentId)) as SpApiReportDocumentResponse,
    })) as SpApiReportDocumentResponse;

    const response = await runWithSpApiBackoff({
        operation: `download BA report document (${reportDocumentId})`,
        run: async () => {
            const candidate = await spApiClient.fetchWithTimeout(
                document.url,
                BA_REPORT_DOCUMENT_DOWNLOAD_TIMEOUT_MS
            );
            if (!candidate.ok) {
                throw createSpApiHttpError(
                    `BA report document download failed with status ${candidate.status}.`,
                    candidate.status
                );
            }
            if (!candidate.body) {
                throw new Error('BA report document download returned an empty response body.');
            }

            return candidate;
        },
    });
    const responseBody = response.body;
    if (!responseBody) {
        throw new Error('BA report document download returned an empty response body.');
    }

    const parsed = await parseAndAggregateKeywords({
        compressionAlgorithm: document.compressionAlgorithm ?? null,
        responseBody: responseBody,
    });

    return {
        debug: parsed.debug,
        dataEndDate: params.dataEndDate,
        dataStartDate: params.dataStartDate,
        fetchedAt: new Date().toISOString(),
        marketplaceId: params.marketplaceId,
        reportId,
        reportPeriod: params.reportPeriod,
        rows: parsed.rows,
    } satisfies BaKeywordsSnapshot;
};

const createBaSearchTermsReport = async (params: BaKeywordsParams) => {
    const report = (await runReportsApiCall({
        operation: 'create BA search terms report',
        run: async () =>
            (await reportsApi.createReport({
                dataEndTime: `${params.dataEndDate}T23:59:59Z`,
                dataStartTime: `${params.dataStartDate}T00:00:00Z`,
                marketplaceIds: [params.marketplaceId],
                reportOptions: { reportPeriod: params.reportPeriod },
                reportType: 'GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT',
            })) as SpApiCreateReportResponse,
    })) as SpApiCreateReportResponse;

    if (!report.reportId) {
        throw new Error(
            'SP-API did not return a reportId for Brand Analytics Search Terms report.'
        );
    }

    return report.reportId;
};

const parseAndAggregateKeywords = async ({
    compressionAlgorithm,
    responseBody,
}: {
    compressionAlgorithm: string | null;
    responseBody: ReadableStream<Uint8Array>;
}) => {
    const source = Readable.fromWeb(responseBody);
    const stream =
        compressionAlgorithm?.toUpperCase() === 'GZIP'
            ? source.pipe(createGunzip())
            : source;

    const accumulator = createBaKeywordAccumulator();
    const debug: BaKeywordsSnapshotDebug = {
        acceptedTopRows: 0,
        dataArrayDetected: false,
        emptySearchTermRows: 0,
        invalidRankRows: 0,
        keptKeywordCount: 0,
        malformedObjectRows: 0,
        parsedObjectRows: 0,
        rejectedByReason: {},
    };
    let startedDataArray = false;
    let captureObject = false;
    let objectDepth = 0;
    let inString = false;
    let escape = false;
    let objectBuffer = '';

    for await (const chunk of stream) {
        const text = chunk.toString('utf8');

        for (let index = 0; index < text.length; index += 1) {
            const character = text[index];

            if (!startedDataArray) {
                if (character === '[') {
                    startedDataArray = true;
                    debug.dataArrayDetected = true;
                }
                continue;
            }

            if (!captureObject) {
                if (character === '{') {
                    captureObject = true;
                    objectDepth = 1;
                    inString = false;
                    escape = false;
                    objectBuffer = '{';
                }
                continue;
            }

            objectBuffer += character;

            if (inString) {
                if (escape) {
                    escape = false;
                } else if (character === '\\') {
                    escape = true;
                } else if (character === '"') {
                    inString = false;
                }
                continue;
            }

            if (character === '"') {
                inString = true;
                continue;
            }

            if (character === '{') {
                objectDepth += 1;
                continue;
            }

            if (character === '}') {
                objectDepth -= 1;

                if (objectDepth === 0) {
                    try {
                        const parsedRow = JSON.parse(objectBuffer) as RawBaSearchTermsRow;
                        debug.parsedObjectRows += 1;
                        addBaKeywordRowToAccumulator(accumulator, parsedRow, debug);
                    } catch {
                        debug.malformedObjectRows += 1;
                    }

                    captureObject = false;
                    objectBuffer = '';
                }
            }
        }
    }

    const rows = finalizeBaKeywordAccumulator(accumulator);
    debug.keptKeywordCount = rows.length;

    return { debug, rows };
};

const assertSupportedMarketplaceId = (marketplaceId: string) => {
    if (isSupportedSpApiMarketplaceId(marketplaceId)) {
        return;
    }

    throw new Error(
        `Unsupported marketplaceId ${marketplaceId}. Only ${SPAPI_US_MARKETPLACE_ID} is supported.`
    );
};

const runReportsApiCall = async <T>({
    operation,
    run,
}: { operation: string; run: () => Promise<T> }) => {
    return await runWithSpApiBackoff({
        operation,
        run: async () => {
            await spApiClient.ensureAccessTokenFreshness();
            return await baReportsLimiter.schedule(run);
        },
    });
};
