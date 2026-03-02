import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
// @ts-expect-error - SDK doesn't export types properly in package.json
import { ReportsSpApi } from '@amazon-sp-api-release/amazon-sp-api-sdk-js';
import Bottleneck from 'bottleneck';
import { env } from '@/config/env.js';
import {
    isSupportedSpApiMarketplaceId,
    SPAPI_US_MARKETPLACE_ID,
} from '@/services/spapi/marketplaces.js';
import {
    addBaKeywordRowToAccumulator,
    createBaKeywordAccumulator,
    finalizeBaKeywordAccumulator,
    type BaKeywordRow,
    type RawBaSearchTermsRow,
} from '@/services/spapi/ba-keywords-aggregation.js';

const BA_REPORT_POLL_INTERVAL_MS = 5000;
const BA_REPORT_POLL_MAX_ATTEMPTS = 90;

export type BaReportPeriod = 'MONTH' | 'WEEK';

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

const reportsApiClient = new ReportsSpApi.ApiClient('https://sellingpartnerapi-na.amazon.com');
reportsApiClient.enableAutoRetrievalAccessToken(
    env.SPAPI_CLIENT_ID,
    env.SPAPI_APP_CLIENT_SECRET,
    env.SPAPI_REFRESH_TOKEN,
    null
);

const reportsApi = new ReportsSpApi.ReportsApi(reportsApiClient);
const baReportsLimiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 500,
    reservoir: 2,
    reservoirRefreshAmount: 2,
    reservoirRefreshInterval: 1000,
});

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

export const fetchBaKeywordsSnapshot = async (
    params: BaKeywordsParams
): Promise<BaKeywordsSnapshot> => {
    if (!isSupportedSpApiMarketplaceId(params.marketplaceId)) {
        throw new Error(
            `Unsupported marketplaceId ${params.marketplaceId}. Only ${SPAPI_US_MARKETPLACE_ID} is supported.`
        );
    }

    const reportId = await createBaSearchTermsReport(params);
    const report = await waitForReportDone(reportId);

    if (!report.reportDocumentId) {
        throw new Error(`BA report ${reportId} completed without a reportDocumentId.`);
    }

    const document = (await baReportsLimiter.schedule(() =>
        reportsApi.getReportDocument(report.reportDocumentId)
    )) as SpApiReportDocumentResponse;

    const response = await fetch(document.url);
    if (!response.ok || !response.body) {
        throw new Error(`BA report document download failed with status ${response.status}.`);
    }

    const parsed = await parseAndAggregateKeywords({
        compressionAlgorithm: document.compressionAlgorithm ?? null,
        responseBody: response.body,
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
    const report = (await baReportsLimiter.schedule(() =>
        reportsApi.createReport({
            dataEndTime: `${params.dataEndDate}T23:59:59Z`,
            dataStartTime: `${params.dataStartDate}T00:00:00Z`,
            marketplaceIds: [params.marketplaceId],
            reportOptions: { reportPeriod: params.reportPeriod },
            reportType: 'GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT',
        })
    )) as SpApiCreateReportResponse;

    if (!report.reportId) {
        throw new Error('SP-API did not return a reportId for Brand Analytics Search Terms report.');
    }

    return report.reportId;
};

const waitForReportDone = async (reportId: string) => {
    for (let attempt = 0; attempt < BA_REPORT_POLL_MAX_ATTEMPTS; attempt += 1) {
        const report = (await baReportsLimiter.schedule(() =>
            reportsApi.getReport(reportId)
        )) as SpApiGetReportResponse;
        const status = String(report.processingStatus ?? 'UNKNOWN');

        if (status === 'DONE') {
            return report;
        }

        if (status === 'FATAL' || status === 'CANCELLED') {
            throw new Error(`BA report ${reportId} ended with status ${status}.`);
        }

        await sleep(BA_REPORT_POLL_INTERVAL_MS);
    }

    throw new Error(`BA report ${reportId} did not finish in time.`);
};

const parseAndAggregateKeywords = async ({
    compressionAlgorithm,
    responseBody,
}: {
    compressionAlgorithm: string | null;
    responseBody: ReadableStream<Uint8Array>;
}) => {
    const source = Readable.fromWeb(responseBody);
    const stream = compressionAlgorithm?.toUpperCase() === 'GZIP' ? source.pipe(createGunzip()) : source;

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
