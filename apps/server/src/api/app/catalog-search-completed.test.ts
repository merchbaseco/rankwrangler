import { expect, it } from 'bun:test';
import type { Context } from '@/api/context';
import { appRouter } from '@/api/router';
import { notifyCatalogSearchCompleted } from '@/services/catalog-search-events';

it('publishes Catalog-search completion at the domain-specific app subscription path', async () => {
    const caller = appRouter.createCaller(createClerkContext());
    const subscription = await caller.api.app.catalog.search.completed({
        queryId: '22222222-2222-4222-8222-222222222222',
    });
    const receivedEvents: unknown[] = [];
    const observer = subscription.subscribe({
        next: event => {
            receivedEvents.push(event);
        },
    });

    notifyCatalogSearchCompleted({
        operationId: '11111111-1111-4111-8111-111111111111',
        queryId: '22222222-2222-4222-8222-222222222222',
    });

    expect(receivedEvents).toEqual([
        {
            operationId: '11111111-1111-4111-8111-111111111111',
            queryId: '22222222-2222-4222-8222-222222222222',
        },
    ]);
    observer.unsubscribe();
});

const createClerkContext = () =>
    ({
        user: { sub: 'user_1', email: 'seller@example.com' },
        isAdmin: false,
        authType: 'clerk',
        license: null,
        licenseError: undefined,
        request: { headers: {} },
    }) as Context;
