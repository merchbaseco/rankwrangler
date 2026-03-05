// @ts-expect-error - SDK doesn't export types properly in package.json
import { CatalogitemsSpApi, ReportsSpApi } from '@amazon-sp-api-release/amazon-sp-api-sdk-js';
import Bottleneck from 'bottleneck';
import { ensureAccessTokenFreshness as ensureSpApiAccessTokenFreshness } from '@/services/spapi/spapi-access-token.js';
import {
    createSpApiHttpError,
    runWithSpApiBackoff,
} from '@/services/spapi/spapi-backoff.js';
import {
    SpApiLimiterManager,
    type SpApiOperationRateLimiterStat,
} from '@/services/spapi/spapi-limiter-manager.js';

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
    reservoirIncreaseInterval: 1_000,
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
    reservoirIncreaseInterval: 1_000,
    reservoirIncreaseMaximum: 2,
} as const;

type ReportsOperation = 'createReport' | 'getReport' | 'getReportDocument';

type LimiterSettings = {
    reservoirIncreaseAmount: number;
    reservoirIncreaseInterval: number;
};

export class SpApiClient {
    readonly catalog: InstanceType<typeof CatalogitemsSpApi.ApiClient>;
    readonly reports: InstanceType<typeof ReportsSpApi.ApiClient>;
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

    createReport = async (payload: unknown) => {
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

    fetchWithTimeoutAndBackoff = async ({
        operation,
        timeoutMs,
        url,
    }: {
        operation: string;
        timeoutMs: number;
        url: string;
    }) => {
        return await runWithSpApiBackoff({
            operation,
            run: async () => {
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
            },
        });
    };

    fetchWithTimeout = async (url: string, timeoutMs: number) => {
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

    private runReportOperation = async <T>({
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

    private ensureAccessTokenFreshness = async (
        client:
            | InstanceType<typeof CatalogitemsSpApi.ApiClient>
            | InstanceType<typeof ReportsSpApi.ApiClient>
    ) => {
        await ensureSpApiAccessTokenFreshness(client);
    };

    private isAbortError = (error: unknown) => {
        return (
            error instanceof Error &&
            (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
        );
    };
}

export const createSpApiClient = () => {
    if (!sharedSpApiClient) {
        sharedSpApiClient = new SpApiClient();
    }

    return sharedSpApiClient;
};

let sharedSpApiClient: SpApiClient | null = null;

const getConfiguredRpsFromSettings = (settings: LimiterSettings) => {
    return settings.reservoirIncreaseAmount / (settings.reservoirIncreaseInterval / 1_000);
};

export type { SpApiOperationRateLimiterStat };
