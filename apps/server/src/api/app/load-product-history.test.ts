import { describe, expect, it, mock } from 'bun:test';
import { requestManualProductHistorySync } from './load-product-history.js';

describe('manual Product-history request', () => {
    it('ensures the Product then returns a pending durable Operation', async () => {
        let productEnsured = false;
        const deps = {
            fetchProductInfo: mock(async () => {
                productEnsured = true;
                return { asin: 'B012345678' } as never;
            }),
            requestProductHistoryRefresh: mock(async () => {
                expect(productEnsured).toBe(true);
                return {
                    operation: {
                        id: '11111111-1111-4111-8111-111111111111',
                        type: 'productHistoryRefresh' as const,
                        status: 'pending' as const,
                        retryAfterSeconds: 2 as const,
                        createdAt: '2026-07-23T12:00:00.000Z',
                        updatedAt: '2026-07-23T12:00:00.000Z',
                    },
                    created: true,
                };
            }),
        };

        const result = await requestManualProductHistorySync({
            input: {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                days: 365,
            },
            deps,
        });

        expect(result.operation.status).toBe('pending');
        expect(deps.requestProductHistoryRefresh.mock.calls).toHaveLength(1);
    });
});
