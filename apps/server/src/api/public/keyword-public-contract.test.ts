import { describe, expect, it, mock } from 'bun:test';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import { createKeywordGetProcedure, type KeywordGetDeps } from './keyword-get';
import { createKeywordHistoryProcedure, type KeywordHistoryDeps } from './keyword-history';
import { createKeywordSearchProcedure, type KeywordSearchDeps } from './keyword-search';

describe('public keyword tRPC contract', () => {
    it('returns final keyword data without freshness metadata or refresh inputs', async () => {
        const getKeywordIntelligence = mock(async () => ({
            keyword: 'garden shirt',
            status: 'ready' as const,
            current: null,
        }));
        const searchKeywordIntelligence = mock(async () => ({
            status: 'empty' as const,
            items: [],
            nextCursor: null,
            summary: {
                marketplaceId: 'ATVPDKIKX0DER' as const,
                reportPeriod: 'DAY' as const,
                dataStartDate: null,
                dataEndDate: null,
                observedDate: null,
                fetchedAt: null,
                totalFiltered: 0,
            },
        }));
        const getKeywordHistory = mock(async () => ({
            keyword: 'garden shirt',
            marketplaceId: 'ATVPDKIKX0DER' as const,
            reportPeriod: 'DAY' as const,
            rangeDays: 90,
            status: 'empty' as const,
            latestObservedDate: null,
            points: [],
            deltas: {
                d1: { rankDelta: null, clickShareDelta: null, conversionShareDelta: null },
                d7: { rankDelta: null, clickShareDelta: null, conversionShareDelta: null },
                d30: { rankDelta: null, clickShareDelta: null, conversionShareDelta: null },
            },
        }));
        const caller = createCaller({
            getKeywordIntelligence,
            searchKeywordIntelligence,
            getKeywordHistory,
        });

        const [getResult, searchResult, historyResult] = await Promise.all([
            caller.get({ keyword: 'garden shirt' }),
            caller.search({ text: 'garden' }),
            caller.history({ keyword: 'garden shirt' }),
        ]);

        expect(getResult).not.toHaveProperty('freshness');
        expect(searchResult).not.toHaveProperty('freshness');
        expect(historyResult).not.toHaveProperty('freshness');
        expect(getKeywordIntelligence.mock.calls[0]?.[0]).not.toHaveProperty('refresh');
        expect(searchKeywordIntelligence.mock.calls[0]?.[0]).not.toHaveProperty('refresh');
        expect(getKeywordHistory.mock.calls[0]?.[0]).not.toHaveProperty('refresh');
    });

    it('rejects removed refresh inputs', async () => {
        const caller = createCaller();

        const error = await caller
            .get({ keyword: 'garden shirt', refresh: true } as never)
            .catch(reason => reason);

        expect(error).toMatchObject({ code: 'BAD_REQUEST' });
    });
});

const createCaller = (
    overrides: Partial<KeywordGetDeps & KeywordSearchDeps & KeywordHistoryDeps> = {}
) =>
    router({
        get: createKeywordGetProcedure({
            getKeywordIntelligence:
                overrides.getKeywordIntelligence ?? mock(async () => createKeyword()),
            consumeServiceAccountUsageForRequest:
                overrides.consumeServiceAccountUsageForRequest ?? mock(async () => undefined),
        }),
        search: createKeywordSearchProcedure({
            searchKeywordIntelligence:
                overrides.searchKeywordIntelligence ?? mock(async () => createKeywordSearch()),
            consumeServiceAccountUsageForRequest:
                overrides.consumeServiceAccountUsageForRequest ?? mock(async () => undefined),
        }),
        history: createKeywordHistoryProcedure({
            getKeywordHistory:
                overrides.getKeywordHistory ?? mock(async () => createKeywordHistory()),
            consumeServiceAccountUsageForRequest:
                overrides.consumeServiceAccountUsageForRequest ?? mock(async () => undefined),
        }),
    }).createCaller(createPublicContext());

const createKeyword = () => ({
    keyword: 'garden shirt',
    status: 'empty' as const,
    current: null,
});

const createKeywordSearch = () => ({
    status: 'empty' as const,
    items: [],
    nextCursor: null,
    summary: {
        marketplaceId: 'ATVPDKIKX0DER' as const,
        reportPeriod: 'DAY' as const,
        dataStartDate: null,
        dataEndDate: null,
        observedDate: null,
        fetchedAt: null,
        totalFiltered: 0,
    },
});

const createKeywordHistory = () => ({
    keyword: 'garden shirt',
    marketplaceId: 'ATVPDKIKX0DER' as const,
    reportPeriod: 'DAY' as const,
    rangeDays: 90,
    status: 'empty' as const,
    latestObservedDate: null,
    points: [],
    deltas: {
        d1: { rankDelta: null, clickShareDelta: null, conversionShareDelta: null },
        d7: { rankDelta: null, clickShareDelta: null, conversionShareDelta: null },
        d30: { rankDelta: null, clickShareDelta: null, conversionShareDelta: null },
    },
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
