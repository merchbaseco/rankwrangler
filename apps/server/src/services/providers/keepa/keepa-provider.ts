import Bottleneck from 'bottleneck';
import { captureProviderAttempt } from '@/services/providers/provider-telemetry';
import { getKeepaProviderPriority, requireKeepaDomainId } from './keepa-marketplaces';
import {
    KeepaApiError,
    type KeepaCategoryResponse,
    type KeepaProviderPriority,
    type KeepaResponse,
    type KeepaRuntimeTokenState,
    type KeepaTokenResponse,
    type KeepaUsage,
    type KeepaUsageSource,
} from './keepa-provider-types';

const KEEPA_TOKEN_STATE_STALE_MS = 60 * 1000;
const KEEPA_UPDATE_HOURS = 1;

interface KeepaProviderDeps {
    apiKey: string | undefined;
    capture: typeof captureProviderAttempt;
    fetchImpl: typeof fetch;
}

export class KeepaProvider {
    private readonly limiter = new Bottleneck({
        maxConcurrent: 1,
        minTime: 3000,
        reservoir: 20,
        reservoirRefreshAmount: 20,
        reservoirRefreshInterval: 60 * 1000,
    });
    private readonly deps: KeepaProviderDeps;
    private readonly tokenState = {
        tokensConsumed: null as number | null,
        tokensLeft: null as number | null,
        refillInMs: null as number | null,
        refillRate: null as number | null,
        updatedAt: null as Date | null,
    };
    private tokenRefreshInFlight: Promise<KeepaRuntimeTokenState> | null = null;

    constructor(overrides: Partial<KeepaProviderDeps> = {}) {
        this.deps = {
            apiKey: process.env.KEEPA_API_KEY,
            capture: captureProviderAttempt,
            fetchImpl: fetch,
            ...overrides,
        };
    }

    isConfigured = () => Boolean(this.deps.apiKey);

    getProduct = async ({
        marketplaceId,
        asin,
        days,
        priority,
        canDispatch,
    }: {
        marketplaceId: string;
        asin: string;
        days: number;
        priority: 'manualProduct' | 'scheduledProduct';
        canDispatch?: () => Promise<boolean>;
    }) => {
        const domainId = requireKeepaDomainId(marketplaceId);
        return await this.schedule(priority, async () => {
            if (canDispatch && !(await canDispatch())) {
                return { kind: 'skipped' } as const;
            }
            const payload = await this.fetchJson<KeepaResponse>({
                operation: 'keepa.product',
                path: 'product',
                params: {
                    domain: String(domainId),
                    asin,
                    history: '1',
                    update: String(KEEPA_UPDATE_HOURS),
                    days: String(days),
                    stats: '365',
                },
            });
            this.recordUsage(payload);
            return { kind: 'fetched', payload } as const;
        });
    };

    searchCatalog = async ({
        marketplaceId,
        term,
        priority,
    }: {
        marketplaceId: string;
        term: string;
        priority: 'interactiveCatalog' | 'scheduledCatalog';
    }) => {
        const domainId = requireKeepaDomainId(marketplaceId);
        return await this.schedule(priority, async () => {
            const payload = await this.fetchJson<KeepaResponse>({
                operation: 'keepa.catalog.search',
                path: 'search',
                params: {
                    domain: String(domainId),
                    type: 'product',
                    term,
                    page: '0',
                    'asins-only': '0',
                    stats: '365',
                    update: '1',
                    history: '1',
                },
            });
            this.recordUsage(payload);
            return payload;
        });
    };

    getCategories = async ({
        marketplaceId,
        categoryIds,
    }: {
        marketplaceId: string;
        categoryIds: number[];
    }) => {
        const domainId = requireKeepaDomainId(marketplaceId);
        return await this.schedule('manualProduct', async () => {
            const payload = await this.fetchJson<KeepaCategoryResponse>({
                operation: 'keepa.category',
                path: 'category',
                params: {
                    domain: String(domainId),
                    category: categoryIds.join(','),
                },
            });
            this.recordUsage(payload);
            return payload;
        });
    };

    ensureFreshTokenState = async ({
        maxAgeMs = KEEPA_TOKEN_STATE_STALE_MS,
    }: {
        maxAgeMs?: number;
    } = {}) => {
        if (!(this.deps.apiKey && this.isTokenStateStale(maxAgeMs))) {
            return this.getRuntimeTokenState();
        }
        if (this.tokenRefreshInFlight) {
            return await this.tokenRefreshInFlight;
        }

        this.tokenRefreshInFlight = this.refreshTokenState();
        try {
            return await this.tokenRefreshInFlight;
        } finally {
            this.tokenRefreshInFlight = null;
        }
    };

    getRuntimeTokenState = (): KeepaRuntimeTokenState => ({
        tokensConsumed: this.tokenState.tokensConsumed,
        tokensLeft: estimateTokensLeft(this.tokenState),
        refillInMs: this.tokenState.refillInMs,
        refillRate: this.tokenState.refillRate,
        updatedAt: this.tokenState.updatedAt?.toISOString() ?? null,
    });

    private readonly refreshTokenState = async () => {
        try {
            const payload = await this.schedule('interactiveCatalog', async () => {
                return await this.fetchJson<KeepaTokenResponse | number>({
                    operation: 'keepa.token',
                    path: 'token',
                    params: {},
                });
            });
            this.recordUsage(normalizeTokenResponse(payload));
        } catch (error) {
            if (error instanceof KeepaApiError) {
                this.recordUsage(error);
            }
        }
        return this.getRuntimeTokenState();
    };

    private readonly fetchJson = async <T>({
        operation,
        path,
        params,
    }: {
        operation: 'keepa.product' | 'keepa.token' | 'keepa.category' | 'keepa.catalog.search';
        path: string;
        params: Record<string, string>;
    }) => {
        const apiKey = this.deps.apiKey;
        if (!apiKey) {
            throw new Error('KEEPA_API_KEY is not configured');
        }
        const query = new URLSearchParams({ key: apiKey, ...params });
        const result = await this.deps.capture({ provider: 'keepa', operation }, async () => {
            const response = await this.deps.fetchImpl(
                `https://api.keepa.com/${path}?${query.toString()}`
            );
            const payload = (await response.json()) as T;
            const error = getKeepaPayloadError(payload);
            if (!response.ok || error) {
                const keepaError = new KeepaApiError({
                    code: error?.code ?? String(response.status),
                    message: error?.message ?? `HTTP ${response.status}`,
                    payload,
                    status: response.status,
                });
                this.recordUsage(keepaError);
                throw keepaError;
            }
            return { payload, status: response.status };
        });
        return result.payload;
    };

    private readonly schedule = async <T>(
        priority: KeepaProviderPriority,
        run: () => Promise<T>
    ) => {
        return await this.limiter.schedule({ priority: getKeepaProviderPriority(priority) }, run);
    };

    private readonly recordUsage = (payload: KeepaUsageSource) => {
        this.tokenState.tokensConsumed = payload.tokensConsumed ?? null;
        this.tokenState.tokensLeft = payload.tokensLeft ?? null;
        this.tokenState.refillInMs = payload.refillIn ?? null;
        this.tokenState.refillRate = payload.refillRate ?? null;
        this.tokenState.updatedAt = new Date();
    };

    private readonly isTokenStateStale = (maxAgeMs: number) => {
        return (
            !this.tokenState.updatedAt ||
            Date.now() - this.tokenState.updatedAt.getTime() > maxAgeMs
        );
    };
}

export const createKeepaProvider = () => {
    sharedKeepaProvider ??= new KeepaProvider();
    return sharedKeepaProvider;
};

let sharedKeepaProvider: KeepaProvider | null = null;

const getKeepaPayloadError = (payload: unknown) => {
    if (!(isRecord(payload) && isRecord(payload.error))) {
        return null;
    }
    const code = typeof payload.error.code === 'string' ? payload.error.code : undefined;
    const type = typeof payload.error.type === 'string' ? payload.error.type : undefined;
    const message = typeof payload.error.message === 'string' ? payload.error.message : undefined;
    return message ? { code: code ?? type, message } : null;
};

const normalizeTokenResponse = (payload: KeepaTokenResponse | number): KeepaTokenResponse => {
    return typeof payload === 'number' ? { tokensLeft: payload } : payload;
};

const estimateTokensLeft = (state: KeepaUsage & { updatedAt: Date | null }) => {
    if (state.tokensLeft === null || state.refillRate === null || !state.updatedAt) {
        return state.tokensLeft;
    }
    const elapsedMs = Date.now() - state.updatedAt.getTime();
    const refillDelayMs = state.refillInMs && state.refillInMs > 0 ? state.refillInMs : 0;
    if (elapsedMs <= refillDelayMs) {
        return state.tokensLeft;
    }
    return (
        state.tokensLeft + (Math.floor((elapsedMs - refillDelayMs) / 60_000) + 1) * state.refillRate
    );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;
