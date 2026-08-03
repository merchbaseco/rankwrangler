import { expect, it } from 'bun:test';
import type { Context } from '@/api/context';
import { appRouter } from '@/api/router';
import { notifyProductSyncCompleted } from '@/services/product-sync-events';

it('publishes Product-sync completion at the domain-specific app subscription path', async () => {
    const caller = appRouter.createCaller(createClerkContext());
    const subscription = await caller.api.app.product.sync.completed({
        marketplaceId: 'ATVPDKIKX0DER',
    });
    const receivedEvents: unknown[] = [];
    const observer = subscription.subscribe({
        next: event => {
            receivedEvents.push(event);
        },
    });

    notifyProductSyncCompleted({
        marketplaceId: 'ATVPDKIKX0DER',
        asin: 'B012345678',
    });
    notifyProductSyncCompleted({
        marketplaceId: 'A1F83G8C2ARO7P',
        asin: 'B087654321',
    });

    expect(receivedEvents).toEqual([
        {
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
