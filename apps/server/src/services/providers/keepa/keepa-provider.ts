import Bottleneck from 'bottleneck';
import { captureProviderAttempt } from '@/services/providers/provider-telemetry';
import type { KeepaAttemptRequest, KeepaWorkClass } from './keepa-capacity-types';
import { fetchKeepaJson } from './keepa-fetch';
import { reserveKeepaCapacity } from './keepa-interactive-reserve';
import { getKeepaProviderPriority, requireKeepaDomainId } from './keepa-marketplaces';
import { keepaProductParams } from './keepa-product-params';
import { lazyPersistedCapacity } from './keepa-persisted-capacity';
import type {
    KeepaCategoryResponse,
    KeepaProviderDeps,
    KeepaProviderPriority,
    KeepaResponse,
    KeepaRuntimeTokenState,
    KeepaUsageSource,
} from './keepa-provider-types';
import { estimateTokensLeft } from './keepa-runtime-state';

const KEEPA_TOKEN_STATE_STALE_MS = 60 * 1000;

export class KeepaProvider {
    // Pacing only: the durable token reservation decides what may be spent, and live requests jump
    // the queue. Two calls at a time keep one slow save from stalling the refill.
    private readonly limiter = new Bottleneck({ maxConcurrent: 2, minTime: 1000 });
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
            apiKey: process.env.RANKWRANGLER_KEEPA_API_KEY,
            capture: captureProviderAttempt,
            fetchImpl: fetch,
            capacity: lazyPersistedCapacity,
            ...overrides,
        };
    }

    isConfigured = () => Boolean(this.deps.apiKey);

    // Someone is waiting on this product, so it is interactive work.
    getProduct = async ({
        marketplaceId,
        asin,
        days,
        canDispatch,
    }: {
        marketplaceId: string;
        asin: string;
        days: number;
        canDispatch?: () => Promise<boolean>;
    }) => {
        const request: KeepaAttemptRequest = { operation: 'product', workClass: 'interactive' };
        return await this.schedule('manualProduct', request, async attemptId => {
            if (canDispatch && !(await canDispatch())) {
                return { kind: 'skipped' } as const;
            }
            const payload = await this.fetchJson<KeepaResponse>({
                operation: 'keepa.product',
                attemptId,
                request,
                path: 'product',
                params: keepaProductParams({ marketplaceId, asins: [asin], days }),
            });
            return { kind: 'fetched', payload } as const;
        });
    };

    // Background history: one request for up to 100 products, reserved at the per-product cost each.
    getProducts = async ({
        marketplaceId,
        asins,
        days,
    }: {
        marketplaceId: string;
        asins: readonly string[];
        days: number;
    }) => {
        const request: KeepaAttemptRequest = {
            operation: 'product',
            workClass: 'history',
            itemCount: asins.length,
        };
        return await this.schedule('scheduledProduct', request, attemptId =>
            this.fetchJson<KeepaResponse>({
                operation: 'keepa.product',
                attemptId,
                request,
                path: 'product',
                params: keepaProductParams({ marketplaceId, asins, days }),
            })
        );
    };

    searchCatalog = async ({
        marketplaceId,
        term,
        priority,
        page = 0,
        workClass,
        keywordId,
        workId,
    }: {
        marketplaceId: string;
        term: string;
        page?: number;
        workClass?: KeepaWorkClass;
        keywordId?: string;
        workId?: string;
        priority: 'interactiveCatalog' | 'scheduledCatalog';
    }) => {
        const domainId = requireKeepaDomainId(marketplaceId);
        if (page !== 0) {
            throw new Error('Keepa search supports only the first result page');
        }
        const request: KeepaAttemptRequest = {
            operation: 'search',
            workClass: workClass ?? (priority === 'interactiveCatalog' ? 'interactive' : 'head'),
            keywordId,
            workId,
        };
        return await this.schedule(
            priority,
            request,
            async attemptId => {
                const payload = await this.fetchJson<KeepaResponse>({
                    operation: 'keepa.catalog.search',
                    attemptId,
                    request,
                    path: 'search',
                    params: {
                        domain: String(domainId),
                        type: 'product',
                        term,
                        page: String(page),
                        'asins-only': '0',
                        stats: '365',
                        update: '1',
                        history: '1',
                    },
                });
                return payload;
            }
        );
    };

    getCategories = async ({
        marketplaceId,
        categoryIds,
    }: {
        marketplaceId: string;
        categoryIds: number[];
    }) => {
        const domainId = requireKeepaDomainId(marketplaceId);
        return await this.schedule(
            'manualProduct',
            { operation: 'category', workClass: 'interactive' },
            async attemptId => {
                const payload = await this.fetchJson<KeepaCategoryResponse>({
                    operation: 'keepa.category',
                    attemptId,
                    request: { operation: 'category', workClass: 'interactive' },
                    path: 'category',
                    params: {
                        domain: String(domainId),
                        category: categoryIds.join(','),
                    },
                });
                return payload;
            }
        );
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
            await this.fetchJson({
                operation: 'keepa.token',
                path: 'token',
                params: {},
                request: { operation: 'token', workClass: 'interactive' },
            });
        } catch {
            // The durable gate fails closed if no fresh bucket observation was obtained.
        }
        return this.getRuntimeTokenState();
    };

    private readonly fetchJson = async <T>({
        operation,
        path,
        params,
        request,
        attemptId: queuedId,
    }: {
        operation: 'keepa.product' | 'keepa.token' | 'keepa.category' | 'keepa.catalog.search';
        path: 'product' | 'token' | 'category' | 'search';
        params: Record<string, string>;
        request: KeepaAttemptRequest;
        attemptId?: string;
    }): Promise<T> => {
        const apiKey = this.deps.apiKey;
        if (!apiKey) {
            throw new Error('RANKWRANGLER_KEEPA_API_KEY is not configured');
        }
        if (path !== 'token') {
            await this.ensureFreshTokenState();
        }
        const attemptId = queuedId ?? (await this.deps.capacity.enqueue(request));
        await reserveKeepaCapacity({
            capacity: this.deps.capacity,
            attemptId,
            workClass: request.workClass,
            refreshBucket: () => this.ensureFreshTokenState(),
        });
        return await fetchKeepaJson<T>({
            ...this.deps,
            operation,
            path,
            params,
            apiKey,
            attemptId,
            recordUsage: this.recordUsage,
        });
    };

    private readonly schedule = async <T>(
        priority: KeepaProviderPriority,
        request: KeepaAttemptRequest,
        run: (attemptId: string) => Promise<T>
    ) => {
        if (!this.deps.apiKey) {
            throw new Error('RANKWRANGLER_KEEPA_API_KEY is not configured');
        }
        const id = await this.deps.capacity.enqueue(request);
        try {
            return await this.limiter.schedule(
                { priority: getKeepaProviderPriority(priority) },
                () => run(id)
            );
        } finally {
            await this.deps.capacity.cancel(id);
        }
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
