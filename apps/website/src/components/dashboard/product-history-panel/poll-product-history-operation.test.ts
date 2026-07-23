import { describe, expect, it, mock } from 'bun:test';
import { pollProductHistoryOperation } from './poll-product-history-operation';

describe('pollProductHistoryOperation', () => {
    it('uses the receipt retry hint until the Operation completes', async () => {
        const completed = {
            id: '11111111-1111-4111-8111-111111111111',
            status: 'completed' as const,
            resource: {
                type: 'productHistory' as const,
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
            },
            error: null,
        };
        const getOperation = mock(async () => completed);
        const wait = mock(async () => {});

        const result = await pollProductHistoryOperation({
            operation: {
                id: completed.id,
                status: 'pending',
                retryAfterSeconds: 2,
            },
            getOperation,
            wait,
        });

        expect(result).toEqual(completed);
        expect(wait.mock.calls).toEqual([[2_000]]);
        expect(getOperation.mock.calls).toEqual([[completed.id]]);
    });

    it('does not poll an already-completed Operation', async () => {
        const operation = {
            id: '11111111-1111-4111-8111-111111111111',
            status: 'completed' as const,
            resource: null,
            error: {
                code: 'PROVIDER_UNAVAILABLE',
                message: 'Product history collection failed.',
            },
        };
        const getOperation = mock(async () => operation);

        expect(
            await pollProductHistoryOperation({
                operation,
                getOperation,
            })
        ).toEqual(operation);
        expect(getOperation.mock.calls).toHaveLength(0);
    });
});
