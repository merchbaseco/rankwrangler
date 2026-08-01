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
        user: { sub: 'mbu_test', email: 'seller@example.com' },
        isAdmin: false,
        authType: 'access',
        credentialKind: 'session',
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
            usageLimit: 100_000,
            lastResetAt: new Date(),
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
