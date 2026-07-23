import { describe, expect, it, mock } from 'bun:test';
import {
    notifyProductHistoryRefreshCompleted,
    subscribeToProductHistoryRefreshCompleted,
} from './product-history-refresh-events';

describe('Product-history refresh completion events', () => {
    it('delivers only the subscribed Product identity and removes closed subscriptions', () => {
        const onCompleted = mock(() => undefined);
        const unsubscribe = subscribeToProductHistoryRefreshCompleted(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
            },
            onCompleted
        );

        notifyProductHistoryRefreshCompleted({
            operationId: '11111111-1111-4111-8111-111111111111',
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B000000000',
        });
        notifyProductHistoryRefreshCompleted({
            operationId: '22222222-2222-4222-8222-222222222222',
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
        });
        unsubscribe();
        notifyProductHistoryRefreshCompleted({
            operationId: '33333333-3333-4333-8333-333333333333',
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
        });

        expect(onCompleted.mock.calls).toEqual([
            [
                {
                    operationId: '22222222-2222-4222-8222-222222222222',
                    marketplaceId: 'ATVPDKIKX0DER',
                    asin: 'B012345678',
                },
            ],
        ]);
    });
});
