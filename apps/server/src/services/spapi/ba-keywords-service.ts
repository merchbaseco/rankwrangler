import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import {
    isSupportedSpApiMarketplaceId,
    SPAPI_US_MARKETPLACE_ID,
} from '@/services/spapi/marketplaces.js';
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
    const report = (await spApiClient.getReport(reportId)) as SpApiGetReportResponse;

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
    const document = (await spApiClient.getReportDocument(
        reportDocumentId
    )) as SpApiReportDocumentResponse;
    const response = await spApiClient.fetchWithTimeoutAndBackoff({
        operation: `download BA report document (${reportDocumentId})`,
        timeoutMs: BA_REPORT_DOCUMENT_DOWNLOAD_TIMEOUT_MS,
        url: document.url,
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
    const report = (await spApiClient.createReport({
        dataEndTime: `${params.dataEndDate}T23:59:59Z`,
        dataStartTime: `${params.dataStartDate}T00:00:00Z`,
        marketplaceIds: [params.marketplaceId],
        reportOptions: { reportPeriod: params.reportPeriod },
        reportType: 'GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT',
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
