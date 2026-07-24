import { describe, expect, it, mock } from 'bun:test';
import {
    collectDueCatalogQueries,
    isCatalogQueryDue,
    updateCatalogQueryTracking,
    type CatalogQueryCollectionDeps,
    type CatalogQueryTrackingUpdateDeps,
} from './catalog-query-tracking';
import type { CatalogSearchOperation } from './catalog-search';

const NOW = new Date('2026-07-24T12:00:00.000Z');

describe('Catalog query weekly tracking', () => {
    it('makes tracked never-run queries due without promoting untracked queries', () => {
        expect(
            isCatalogQueryDue({
                trackedAt: new Date('2026-07-20T12:00:00.000Z'),
                latestSuccessfulRunAt: null,
                now: NOW,
            })
        ).toBeTrue();
        expect(
            isCatalogQueryDue({
                trackedAt: null,
                latestSuccessfulRunAt: null,
                now: NOW,
            })
        ).toBeFalse();
    });

    it('uses an inclusive seven-day boundary', () => {
        expect(
            isCatalogQueryDue({
                trackedAt: new Date('2026-07-01T12:00:00.000Z'),
                latestSuccessfulRunAt: new Date('2026-07-17T12:00:00.001Z'),
                now: NOW,
            })
        ).toBeFalse();
        expect(
            isCatalogQueryDue({
                trackedAt: new Date('2026-07-01T12:00:00.000Z'),
                latestSuccessfulRunAt: new Date('2026-07-17T12:00:00.000Z'),
                now: NOW,
            })
        ).toBeTrue();
        expect(
            isCatalogQueryDue({
                trackedAt: new Date('2026-07-01T12:00:00.000Z'),
                latestSuccessfulRunAt: new Date('2026-07-16T12:00:00.000Z'),
                now: NOW,
            })
        ).toBeTrue();
    });

    it('starts only due tracked work and joins an existing in-flight search', async () => {
        const dueQueries = [
            {
                id: '11111111-1111-4111-8111-111111111111',
                displayTerm: 'Never Run',
            },
            {
                id: '22222222-2222-4222-8222-222222222222',
                displayTerm: 'Already Running',
            },
        ];
        const resolveDueRequest = mock(async ({ queryId }: { queryId: string }) => {
            return queryId === dueQueries[0]?.id
                ? {
                      kind: 'pending' as const,
                      operation: createOperation('operation-1'),
                      created: true,
                  }
                : {
                      kind: 'pending' as const,
                      operation: createOperation('operation-2'),
                      created: false,
                  };
        });
        const dispatchOperation = mock(async () => true);
        const deps: CatalogQueryCollectionDeps = {
            listDueQueries: async () => dueQueries,
            resolveDueRequest,
            dispatchOperation,
        };

        const result = await collectDueCatalogQueries(NOW, deps);

        expect(result).toEqual({
            didWork: true,
            dueCount: 2,
            startedCount: 1,
            joinedCount: 1,
        });
        expect(resolveDueRequest.mock.calls).toHaveLength(2);
        expect(dispatchOperation.mock.calls).toHaveLength(2);
    });

    it('explicitly tracks and untracks an existing normalized query', async () => {
        const setTracking = mock(async ({ enabled }: { enabled: boolean }) => ({
            id: '11111111-1111-4111-8111-111111111111',
            trackedAt: enabled ? NOW : null,
        }));
        const deps: CatalogQueryTrackingUpdateDeps = {
            setTracking,
        };

        expect(
            await updateCatalogQueryTracking(
                { term: '  Retro   Gardening Shirt ', enabled: true, now: NOW },
                deps
            )
        ).toEqual({
            id: '11111111-1111-4111-8111-111111111111',
            tracking: { enabled: true, trackedAt: NOW.toISOString() },
        });
        expect(setTracking.mock.calls[0]?.[0]).toMatchObject({
            normalizedTerm: 'retro gardening shirt',
            enabled: true,
        });
        expect(
            await updateCatalogQueryTracking(
                { term: 'Retro Gardening Shirt', enabled: false, now: NOW },
                deps
            )
        ).toEqual({
            id: '11111111-1111-4111-8111-111111111111',
            tracking: { enabled: false, trackedAt: null },
        });
    });
});

const createOperation = (id: string): CatalogSearchOperation => ({
    id,
    type: 'catalogSearch',
    status: 'pending',
    targetKey: 'query-id',
    input: {
        queryId: 'query-id',
        marketplaceId: 'ATVPDKIKX0DER',
        term: 'Tracked Query',
        page: 0,
        priority: 'scheduled',
    },
    resource: null,
    error: null,
    dispatchedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
});
