import { describe, expect, it, mock } from 'bun:test';
import { type CatalogQueryCollectionDeps, collectDueCatalogQueries } from './catalog-query-refresh';
import {
    CATALOG_QUERY_ACTIVE_WINDOW_MS,
    CATALOG_QUERY_EXPIRING_SOON_WINDOW_MS,
    CATALOG_QUERY_REFRESH_INTERVAL_MS,
    CATALOG_QUERY_REFRESH_RETRY_INTERVAL_MS,
    deriveCatalogQueryStatus,
    isCatalogQueryActive,
    isCatalogQueryDue,
} from './catalog-query-refresh-policy';
import type { CatalogSearchOperation } from './catalog-search';

const NOW = new Date('2026-07-24T12:00:00.000Z');

describe('Catalog keyword refresh policy', () => {
    it('keeps interest active for thirty days after a requested search', () => {
        const activeUntil = new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS);

        expect(isCatalogQueryActive({ activeUntil, now: NOW })).toBeTrue();
        expect(
            isCatalogQueryActive({
                activeUntil: new Date(NOW.getTime() - 1),
                now: NOW,
            })
        ).toBeFalse();
    });

    it('selects active due keywords and excludes expired or fresh interest', () => {
        const activeUntil = new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS);
        const oldRun = new Date(NOW.getTime() - CATALOG_QUERY_REFRESH_INTERVAL_MS);

        expect(
            isCatalogQueryDue({ activeUntil, latestSuccessfulRunAt: oldRun, now: NOW })
        ).toBeTrue();
        expect(
            isCatalogQueryDue({
                activeUntil,
                latestSuccessfulRunAt: new Date(NOW.getTime() - 1),
                now: NOW,
            })
        ).toBeFalse();
        expect(
            isCatalogQueryDue({
                activeUntil: new Date(NOW.getTime() - 1),
                latestSuccessfulRunAt: null,
                now: NOW,
            })
        ).toBeFalse();
    });

    it('derives waiting, deferred, failed, due, expiring, and inactive states', () => {
        const activeUntil = new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS);
        const common = {
            activeUntil,
            latestSuccessfulRunAt: new Date(NOW.getTime() - 1),
            nextRefreshAttemptAt: null,
            hasPendingOperation: false,
            hasFailedOperation: false,
            now: NOW,
        };

        expect(deriveCatalogQueryStatus(common)).toBe('waiting');
        expect(deriveCatalogQueryStatus({ ...common, hasPendingOperation: true })).toBe('pending');
        expect(deriveCatalogQueryStatus({ ...common, hasFailedOperation: true })).toBe('failed');
        expect(
            deriveCatalogQueryStatus({
                ...common,
                nextRefreshAttemptAt: new Date(NOW.getTime() + 1),
            })
        ).toBe('deferred');
        expect(
            deriveCatalogQueryStatus({
                ...common,
                latestSuccessfulRunAt: new Date(NOW.getTime() - CATALOG_QUERY_REFRESH_INTERVAL_MS),
            })
        ).toBe('due');
        expect(
            deriveCatalogQueryStatus({
                ...common,
                activeUntil: new Date(NOW.getTime() + CATALOG_QUERY_EXPIRING_SOON_WINDOW_MS),
            })
        ).toBe('expiringSoon');
        expect(
            deriveCatalogQueryStatus({
                ...common,
                activeUntil: new Date(NOW.getTime() - 1),
            })
        ).toBe('inactive');
    });

    it('dispatches automatic refreshes with provider-safe scheduled priority', async () => {
        const operation = createAutomaticOperation();
        const resolveDueRequest = mock(async () => ({
            kind: 'pending' as const,
            operation,
            created: true,
        }));
        const dispatchOperation = mock((value: CatalogSearchOperation) => {
            expect(value.input.priority).toBe('scheduled');
            expect(value.input.trigger).toBe('automatic');
            return Promise.resolve(true);
        });
        const deps: CatalogQueryCollectionDeps = {
            listDueQueries: () =>
                Promise.resolve([
                    {
                        id: '11111111-1111-4111-8111-111111111111',
                        displayTerm: 'Garden Shirt',
                    },
                ]),
            resolveDueRequest,
            dispatchOperation,
        };

        expect(await collectDueCatalogQueries(NOW, deps)).toEqual({
            didWork: true,
            dueCount: 1,
            startedCount: 1,
            joinedCount: 0,
        });
        expect(resolveDueRequest.mock.calls[0]?.[0]).toEqual({
            queryId: '11111111-1111-4111-8111-111111111111',
            now: NOW,
        });
    });

    it('leaves a failed scheduled operation to retry after bounded backoff', async () => {
        const operation = createAutomaticOperation();
        const resolutions = [
            {
                kind: 'pending' as const,
                operation,
                created: true,
            },
            { kind: 'notDue' as const },
        ];
        const dispatchOperation = mock(() => Promise.resolve(true));
        const deps: CatalogQueryCollectionDeps = {
            listDueQueries: ({ now }) => {
                expect(now).toBe(NOW);
                return Promise.resolve([
                    { id: operation.input.queryId, displayTerm: operation.input.term },
                ]);
            },
            resolveDueRequest: () =>
                Promise.resolve(resolutions.shift() ?? { kind: 'notDue' as const }),
            dispatchOperation,
        };

        await collectDueCatalogQueries(NOW, deps);
        await collectDueCatalogQueries(
            new Date(NOW.getTime() + CATALOG_QUERY_REFRESH_RETRY_INTERVAL_MS - 1),
            {
                ...deps,
                listDueQueries: () =>
                    Promise.resolve([
                        { id: operation.input.queryId, displayTerm: operation.input.term },
                    ]),
            }
        );

        expect(dispatchOperation.mock.calls).toHaveLength(1);
    });
});

const createAutomaticOperation = (): CatalogSearchOperation => ({
    id: '22222222-2222-4222-8222-222222222222',
    type: 'catalogSearch',
    status: 'pending',
    targetKey: '11111111-1111-4111-8111-111111111111',
    input: {
        queryId: '11111111-1111-4111-8111-111111111111',
        marketplaceId: 'ATVPDKIKX0DER',
        term: 'Garden Shirt',
        page: 0,
        priority: 'scheduled',
        trigger: 'automatic',
    },
    resource: null,
    error: null,
    dispatchedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
});
