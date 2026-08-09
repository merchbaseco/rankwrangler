// @ts-expect-error - SDK doesn't export types properly in package.json
import { CatalogitemsSpApi, ReportsSpApi } from '@amazon-sp-api-release/amazon-sp-api-sdk-js';
import Bottleneck from 'bottleneck';
import { captureProviderAttempt } from '@/services/providers/provider-telemetry';
import { ensureAccessTokenFreshness as ensureSpApiAccessTokenFreshness } from './sp-api-access-token';
import { createSpApiHttpError, runWithSpApiBackoff } from './sp-api-backoff';
import { SpApiLimiterManager, type SpApiOperationRateLimiterStat } from './sp-api-limiter-manager';

// Reports API per-operation limits:
// - createReport: 0.0167 RPS, burst 15
// - getReport: 2 RPS, burst 15
// - getReportDocument: 0.0167 RPS, burst 15
const REPORTS_CREATE_LIMIT = {
    maxConcurrent: 1,
    reservoir: 15,
    reservoirIncreaseAmount: 1,
    reservoirIncreaseInterval: 60_000,
    reservoirIncreaseMaximum: 15,
} as const;
const REPORTS_GET_LIMIT = {
    maxConcurrent: 2,
    reservoir: 15,
    reservoirIncreaseAmount: 2,
    reservoirIncreaseInterval: 1000,
    reservoirIncreaseMaximum: 15,
} as const;
const REPORTS_GET_DOCUMENT_LIMIT = {
    maxConcurrent: 1,
    reservoir: 15,
    reservoirIncreaseAmount: 1,
    reservoirIncreaseInterval: 60_000,
    reservoirIncreaseMaximum: 15,
} as const;
const CATALOG_SEARCH_LIMIT = {
    maxConcurrent: 2,
    reservoir: 2,
    reservoirIncreaseAmount: 2,
    reservoirIncreaseInterval: 1000,
    reservoirIncreaseMaximum: 2,
} as const;

type ReportsOperation = 'createReport' | 'getReport' | 'getReportDocument';

interface LimiterSettings {
    reservoirIncreaseAmount: number;
    reservoirIncreaseInterval: number;
}

export interface SpApiCreateReportRequest {
    dataEndTime: string;
    dataStartTime: string;
    marketplaceIds: string[];
    reportOptions: { reportPeriod: 'DAY' | 'WEEK' };
    reportType: 'GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT';
}

export class SpApiProvider {
    private readonly catalog: InstanceType<typeof CatalogitemsSpApi.ApiClient>;
    private readonly reports: InstanceType<typeof ReportsSpApi.ApiClient>;
    private readonly catalogApi: InstanceType<typeof CatalogitemsSpApi.CatalogApi>;
    private readonly reportsApi: InstanceType<typeof ReportsSpApi.ReportsApi>;
    private readonly catalogSearchLimiter: Bottleneck;
    private readonly reportsLimiters: Record<ReportsOperation, Bottleneck>;
    private readonly limiterManager: SpApiLimiterManager;

    constructor() {
        this.catalog = new CatalogitemsSpApi.ApiClient('https://sellingpartnerapi-na.amazon.com');
        this.reports = new ReportsSpApi.ApiClient('https://sellingpartnerapi-na.amazon.com');
        // Disable SDK's built-in limiter because it can drop requests under load.
        // Our own Bottleneck limiter should queue and wait for the next slot.
        this.catalog.disableRateLimiter();
        this.reports.disableRateLimiter();
        this.catalog.timeout = 45_000;
        this.reports.timeout = 45_000;

        this.catalogApi = new CatalogitemsSpApi.CatalogApi(this.catalog);
        this.reportsApi = new ReportsSpApi.ReportsApi(this.reports);
        this.catalogSearchLimiter = new Bottleneck(CATALOG_SEARCH_LIMIT);
        this.reportsLimiters = {
            createReport: new Bottleneck(REPORTS_CREATE_LIMIT),
            getReport: new Bottleneck(REPORTS_GET_LIMIT),
            getReportDocument: new Bottleneck(REPORTS_GET_DOCUMENT_LIMIT),
        };

        this.limiterManager = new SpApiLimiterManager([
            {
                burstCapacity: CATALOG_SEARCH_LIMIT.reservoirIncreaseMaximum,
                configuredRps: getConfiguredRpsFromSettings(CATALOG_SEARCH_LIMIT),
                label: 'Catalog Search',
                limiter: this.catalogSearchLimiter,
                maxConcurrent: CATALOG_SEARCH_LIMIT.maxConcurrent,
                operationId: 'catalog.searchCatalogItems',
            },
            {
                burstCapacity: REPORTS_CREATE_LIMIT.reservoirIncreaseMaximum,
                configuredRps: getConfiguredRpsFromSettings(REPORTS_CREATE_LIMIT),
                label: 'Reports: createReport',
                limiter: this.reportsLimiters.createReport,
                maxConcurrent: REPORTS_CREATE_LIMIT.maxConcurrent,
                operationId: 'reports.createReport',
            },
            {
                burstCapacity: REPORTS_GET_LIMIT.reservoirIncreaseMaximum,
                configuredRps: getConfiguredRpsFromSettings(REPORTS_GET_LIMIT),
                label: 'Reports: getReport',
                limiter: this.reportsLimiters.getReport,
                maxConcurrent: REPORTS_GET_LIMIT.maxConcurrent,
                operationId: 'reports.getReport',
            },
            {
                burstCapacity: REPORTS_GET_DOCUMENT_LIMIT.reservoirIncreaseMaximum,
                configuredRps: getConfiguredRpsFromSettings(REPORTS_GET_DOCUMENT_LIMIT),
                label: 'Reports: getReportDocument',
                limiter: this.reportsLimiters.getReportDocument,
                maxConcurrent: REPORTS_GET_DOCUMENT_LIMIT.maxConcurrent,
                operationId: 'reports.getReportDocument',
            },
        ]);
    }

    searchCatalogItemsByAsins = async ({
        asins,
        marketplaceId,
    }: {
        asins: string[];
        marketplaceId: string;
    }) => {
        return await this.limiterManager.runOperation({
            ensureAccessTokenFreshness: async () =>
                await this.ensureAccessTokenFreshness(this.catalog),
            operation: `search catalog items (${marketplaceId}, ${asins.length} ASINs)`,
            operationId: 'catalog.searchCatalogItems',
            run: async () =>
                await this.catalogApi.searchCatalogItems([marketplaceId], {
                    identifiers: asins,
                    identifiersType: 'ASIN',
                    includedData: ['summaries', 'salesRanks', 'attributes', 'images'],
                    pageSize: 20,
                }),
        });
    };

    searchCatalogItemsByKeyword = async ({
        keyword,
        marketplaceId,
        pageSize,
    }: {
        keyword: string;
        marketplaceId: string;
        pageSize: number;
    }) => {
        return await this.limiterManager.runOperation({
            ensureAccessTokenFreshness: async () =>
                await this.ensureAccessTokenFreshness(this.catalog),
            operation: `search catalog by keyword (${marketplaceId}, ${keyword})`,
            operationId: 'catalog.searchCatalogItems',
            run: async () =>
                await this.catalogApi.searchCatalogItems([marketplaceId], {
                    keywords: [keyword],
                    includedData: ['summaries', 'salesRanks', 'attributes', 'images'],
                    pageSize,
                }),
        });
    };

    createReport = async (payload: SpApiCreateReportRequest) => {
        return await this.runReportOperation({
            operation: 'create BA search terms report',
            operationId: 'reports.createReport',
            run: async () => await this.reportsApi.createReport(payload),
        });
    };

    getReport = async (reportId: string) => {
        return await this.runReportOperation({
            operation: `get BA report status (${reportId})`,
            operationId: 'reports.getReport',
            run: async () => await this.reportsApi.getReport(reportId),
        });
    };

    getReportDocument = async (reportDocumentId: string) => {
        return await this.runReportOperation({
            operation: `get BA report document (${reportDocumentId})`,
            operationId: 'reports.getReportDocument',
            run: async () => await this.reportsApi.getReportDocument(reportDocumentId),
        });
    };

    downloadReportDocument = async ({ timeoutMs, url }: { timeoutMs: number; url: string }) => {
        const operation = 'download BA report document';
        return await runWithSpApiBackoff({
            operation,
            run: async () =>
                await captureProviderAttempt(
                    { provider: 'spapi', operation: 'spapi.reports.download' },
                    async () => {
                        const response = await this.fetchWithTimeout(url, timeoutMs);
                        if (!response.ok) {
                            throw createSpApiHttpError(
                                `${operation} failed with status ${response.status}.`,
                                response.status
                            );
                        }
                        if (!response.body) {
                            throw new Error(`${operation} returned an empty response body.`);
                        }

                        return response;
                    }
                ),
        });
    };

    private readonly fetchWithTimeout = async (url: string, timeoutMs: number) => {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

        try {
            return await fetch(url, { signal: controller.signal });
        } catch (error) {
            if (this.isAbortError(error)) {
                throw new Error(`Request timed out after ${timeoutMs}ms.`);
            }

            throw error;
        } finally {
            clearTimeout(timeoutHandle);
        }
    };

    getOperationRateLimiterStats = async (): Promise<SpApiOperationRateLimiterStat[]> => {
        return await this.limiterManager.getOperationRateLimiterStats();
    };

    private readonly runReportOperation = async <T>({
        operation,
        operationId,
        run,
    }: {
        operation: string;
        operationId: 'reports.createReport' | 'reports.getReport' | 'reports.getReportDocument';
        run: () => Promise<T>;
    }) => {
        return await this.limiterManager.runOperation({
            ensureAccessTokenFreshness: async () =>
                await this.ensureAccessTokenFreshness(this.reports),
            operation,
            operationId,
            run,
        });
    };

    private readonly ensureAccessTokenFreshness = async (
        client:
            | InstanceType<typeof CatalogitemsSpApi.ApiClient>
            | InstanceType<typeof ReportsSpApi.ApiClient>
    ) => {
        await ensureSpApiAccessTokenFreshness(client);
    };

    private readonly isAbortError = (error: unknown) => {
        return (
            error instanceof Error &&
            (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
        );
    };
}

export const createSpApiProvider = () => {
    if (!sharedSpApiProvider) {
        sharedSpApiProvider = new SpApiProvider();
    }

    return sharedSpApiProvider;
};

let sharedSpApiProvider: SpApiProvider | null = null;

const getConfiguredRpsFromSettings = (settings: LimiterSettings) => {
    return settings.reservoirIncreaseAmount / (settings.reservoirIncreaseInterval / 1000);
};
