import { describe, expect, it } from 'bun:test';
import { TRPCError } from '@trpc/server';
import {
    buildPublicOperation,
    type OperationRecord,
    sanitizeOperationError,
} from './operations.js';

describe('Operation public lifecycle', () => {
    it('exposes a pending receipt with retry guidance and no internal dispatch state', () => {
        expect(buildPublicOperation(createOperation())).toEqual({
            id: '11111111-1111-4111-8111-111111111111',
            type: 'productHistoryRefresh',
            status: 'pending',
            retryAfterSeconds: 2,
            createdAt: '2026-07-23T12:00:00.000Z',
            updatedAt: '2026-07-23T12:00:00.000Z',
        });
    });

    it('exposes exactly one typed resource when work completes successfully', () => {
        expect(
            buildPublicOperation({
                ...createOperation(),
                status: 'completed',
                resource: {
                    type: 'productHistory',
                    marketplaceId: 'ATVPDKIKX0DER',
                    asin: 'B012345678',
                },
                completedAt: new Date('2026-07-23T12:01:00.000Z'),
                updatedAt: new Date('2026-07-23T12:01:00.000Z'),
            })
        ).toEqual({
            id: '11111111-1111-4111-8111-111111111111',
            type: 'productHistoryRefresh',
            status: 'completed',
            resource: {
                type: 'productHistory',
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
            },
            error: null,
            createdAt: '2026-07-23T12:00:00.000Z',
            updatedAt: '2026-07-23T12:01:00.000Z',
            completedAt: '2026-07-23T12:01:00.000Z',
        });
    });

    it('sanitizes provider failures before exposing a completed error', () => {
        expect(
            sanitizeOperationError(
                new TRPCError({
                    code: 'BAD_GATEWAY',
                    message: 'Keepa request failed: secret provider payload',
                })
            )
        ).toEqual({
            code: 'PROVIDER_UNAVAILABLE',
            message: 'Product history collection failed. Retry the request shortly.',
        });
    });

    it('rejects a completed record with both a resource and an error', () => {
        expect(() =>
            buildPublicOperation({
                ...createOperation(),
                status: 'completed',
                resource: {
                    type: 'productHistory',
                    marketplaceId: 'ATVPDKIKX0DER',
                    asin: 'B012345678',
                },
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Product history collection failed.',
                },
                completedAt: new Date('2026-07-23T12:01:00.000Z'),
            })
        ).toThrow('must have exactly one outcome');
    });

    it('exposes the same pending contract for Catalog search without provider state', () => {
        const operation: OperationRecord = {
            ...createOperation(),
            type: 'catalogSearch',
            targetKey: '22222222-2222-4222-8222-222222222222',
            input: {
                queryId: '22222222-2222-4222-8222-222222222222',
                marketplaceId: 'ATVPDKIKX0DER',
                term: 'shirts',
                page: 0,
                priority: 'interactive',
                trigger: 'requested',
            },
        };

        expect(buildPublicOperation(operation)).toEqual({
            id: operation.id,
            type: 'catalogSearch',
            status: 'pending',
            retryAfterSeconds: 2,
            createdAt: '2026-07-23T12:00:00.000Z',
            updatedAt: '2026-07-23T12:00:00.000Z',
        });
    });
});

const createOperation = (): OperationRecord => ({
    id: '11111111-1111-4111-8111-111111111111',
    type: 'productHistoryRefresh',
    status: 'pending',
    targetKey: 'ATVPDKIKX0DER:B012345678',
    input: {
        marketplaceId: 'ATVPDKIKX0DER',
        asin: 'B012345678',
        days: 3650,
        ownerMerchbaseUserId: 'mbu_test',
    },
    resource: null,
    error: null,
    dispatchedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    updatedAt: new Date('2026-07-23T12:00:00.000Z'),
});
