import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context.js';
import { router } from '@/api/trpc.js';
import type {
    KeywordHistoryResponse,
    KeywordSearchResponse,
} from '@/services/keyword-intelligence-types.js';
import { RetrievalRetryableError } from '@/services/retrieval-coordinator.js';
import { createKeywordGetProcedure, type KeywordGetDeps } from './keyword-get.js';
import { createKeywordHistoryProcedure, type KeywordHistoryDeps } from './keyword-history.js';
import { createKeywordSearchProcedure, type KeywordSearchDeps } from './keyword-search.js';

describe('public keyword tRPC boundary', () => {
    it('exposes get, search, and history with one freshness envelope and no work state', async () => {
        const freshness = {
            stale: false,
            updatedAt: '2026-08-06T12:00:00.000Z',
        } as const;
        const getKeywordIntelligence = mock(async (input: { refresh: boolean }) => ({
            keyword: 'garden shirt',
            status: 'ready' as const,
            current: { searchFrequencyRank: 12_345 },
            freshness,
            refreshRequested: input.refresh,
        }));
        const searchKeywordIntelligence = mock(
            async (_input: { refresh: boolean }) =>
                ({
                    items: [],
                    nextCursor: null,
                    status: 'empty' as const,
                    summary: {
                        marketplaceId: 'ATVPDKIKX0DER',
                        reportPeriod: 'DAY',
                        dataStartDate: null,
                        dataEndDate: null,
                        observedDate: null,
                        fetchedAt: null,
                        totalFiltered: 0,
                    },
                    freshness,
                }) satisfies KeywordSearchResponse
        );
        const getKeywordHistory = mock(
            async (_input: { refresh: boolean }) =>
                ({
                    keyword: 'garden shirt',
                    marketplaceId: 'ATVPDKIKX0DER',
                    reportPeriod: 'DAY',
                    rangeDays: 90,
                    points: [],
                    status: 'empty' as const,
                    latestObservedDate: null,
                    deltas: {
                        d1: {
                            rankDelta: null,
                            clickShareDelta: null,
                            conversionShareDelta: null,
                        },
                        d7: {
                            rankDelta: null,
                            clickShareDelta: null,
                            conversionShareDelta: null,
                        },
                        d30: {
                            rankDelta: null,
                            clickShareDelta: null,
                            conversionShareDelta: null,
                        },
                    },
                    freshness,
                }) satisfies KeywordHistoryResponse
        );
        const usage = mock(async () => undefined);
        const caller = router({
            get: createKeywordGetProcedure({
                getKeywordIntelligence: getKeywordIntelligence as never,
                consumeServiceAccountUsageForRequest: usage,
            } satisfies KeywordGetDeps),
            search: createKeywordSearchProcedure({
                searchKeywordIntelligence: searchKeywordIntelligence as never,
                consumeServiceAccountUsageForRequest: usage,
            } satisfies KeywordSearchDeps),
            history: createKeywordHistoryProcedure({
                getKeywordHistory: getKeywordHistory as never,
                consumeServiceAccountUsageForRequest: usage,
            } satisfies KeywordHistoryDeps),
        }).createCaller(createPublicContext());

        const [getResult, searchResult, historyResult] = await Promise.all([
            caller.get({ keyword: 'garden shirt', refresh: true }),
            caller.search({ text: 'garden', refresh: true }),
            caller.history({ keyword: 'garden shirt', refresh: true }),
        ]);

        expect(getResult.freshness).toEqual(freshness);
        expect(searchResult.freshness).toEqual(freshness);
        expect(historyResult.freshness).toEqual(freshness);
        expect(getResult).not.toHaveProperty('operation');
        expect(searchResult).not.toHaveProperty('operation');
        expect(historyResult).not.toHaveProperty('operation');
        expect(getKeywordIntelligence.mock.calls[0]?.[0].refresh).toBe(true);
        expect(searchKeywordIntelligence.mock.calls[0]?.[0].refresh).toBe(true);
        expect(getKeywordHistory.mock.calls[0]?.[0].refresh).toBe(true);
        expect(usage.mock.calls).toHaveLength(3);
    });

    it('maps temporary keyword retrieval failures to retryable public errors', async () => {
        const caller = router({
            get: createKeywordGetProcedure({
                getKeywordIntelligence: mock(() => {
                    throw new RetrievalRetryableError(
                        'Keyword performance is temporarily unavailable. Retry shortly.',
                        { retryAfterSeconds: 9, reason: 'capacity' }
                    );
                }) as never,
                consumeServiceAccountUsageForRequest: mock(async () => undefined),
            }),
            search: createKeywordSearchProcedure(),
            history: createKeywordHistoryProcedure(),
        }).createCaller(createPublicContext());

        const error = await caller.get({ keyword: 'garden shirt' }).catch(reason => reason);

        expect(error).toBeInstanceOf(TRPCError);
        expect(error).toMatchObject({
            code: 'TIMEOUT',
            message: 'Keyword performance is temporarily unavailable. Retry after 9 seconds.',
        });
    });
});

const createPublicContext = () =>
    ({
        user: { sub: 'mbu_test' },
        isAdmin: false,
        authType: 'access',
        credentialKind: 'api_key',
        authExpiresAtMs: null,
        accessPrincipal: {
            id: '11111111-1111-4111-8111-111111111111',
            service: 'rankwrangler',
            merchbaseUserId: 'mbu_test',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
            usageToday: 0,
            usageCount: 0,
            usageLimit: 100,
            lastResetAt: new Date(),
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
