import { expect, it } from 'bun:test';
import type { Context } from '@/api/context';
import { appRouter } from '@/api/router';
import { notifyProductHistoryRefreshCompleted } from '@/services/product-history-refresh-events';

it('publishes Product-history completion at the domain-specific app subscription path', async () => {
    const caller = appRouter.createCaller(createClerkContext());
    const subscription = await caller.api.app.product.history.refresh.completed({
        marketplaceId: 'ATVPDKIKX0DER',
        asin: 'B012345678',
    });
    const receivedEvents: unknown[] = [];
    const observer = subscription.subscribe({
        next: event => {
            receivedEvents.push(event);
        },
    });

    notifyProductHistoryRefreshCompleted({
        operationId: '11111111-1111-4111-8111-111111111111',
        marketplaceId: 'ATVPDKIKX0DER',
        asin: 'B012345678',
    });

    expect(receivedEvents).toEqual([
        {
            operationId: '11111111-1111-4111-8111-111111111111',
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
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
