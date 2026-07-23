import { TRPCError } from '@trpc/server';

export const operationTypes = ['productHistoryRefresh'] as const;
export const operationStatuses = ['pending', 'completed'] as const;

export type ProductHistoryOperationInput = {
    marketplaceId: string;
    asin: string;
    days: 3650;
};

export type ProductHistoryResource = {
    type: 'productHistory';
    marketplaceId: string;
    asin: string;
};

export type OperationError = {
    code: 'PROVIDER_UNAVAILABLE' | 'RESOURCE_NOT_FOUND' | 'INTERNAL_ERROR';
    message: string;
};

export type OperationRecord = {
    id: string;
    type: (typeof operationTypes)[number];
    status: (typeof operationStatuses)[number];
    targetKey: string;
    input: ProductHistoryOperationInput;
    resource: ProductHistoryResource | null;
    error: OperationError | null;
    dispatchedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export type PublicOperation =
    | {
          id: string;
          type: 'productHistoryRefresh';
          status: 'pending';
          retryAfterSeconds: 2;
          createdAt: string;
          updatedAt: string;
      }
    | {
          id: string;
          type: 'productHistoryRefresh';
          status: 'completed';
          resource: ProductHistoryResource;
          error: null;
          createdAt: string;
          updatedAt: string;
          completedAt: string;
      }
    | {
          id: string;
          type: 'productHistoryRefresh';
          status: 'completed';
          resource: null;
          error: OperationError;
          createdAt: string;
          updatedAt: string;
          completedAt: string;
      };

export const buildPublicOperation = (operation: OperationRecord): PublicOperation => {
    const common = {
        id: operation.id,
        type: operation.type,
        createdAt: operation.createdAt.toISOString(),
        updatedAt: operation.updatedAt.toISOString(),
    };

    if (operation.status === 'pending') {
        return {
            ...common,
            status: 'pending',
            retryAfterSeconds: 2,
        };
    }

    const outcomeCount = Number(Boolean(operation.resource)) + Number(Boolean(operation.error));
    if (!operation.completedAt || outcomeCount !== 1) {
        throw new Error(`Completed Operation ${operation.id} must have exactly one outcome`);
    }

    const completedAt = operation.completedAt.toISOString();
    if (operation.resource) {
        return {
            ...common,
            status: 'completed',
            resource: operation.resource,
            error: null,
            completedAt,
        };
    }

    if (operation.error) {
        return {
            ...common,
            status: 'completed',
            resource: null,
            error: operation.error,
            completedAt,
        };
    }

    throw new Error(`Completed Operation ${operation.id} must have exactly one outcome`);
};

export const sanitizeOperationError = (error: unknown): OperationError => {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
        return {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Product history is unavailable for this Product.',
        };
    }

    if (
        error instanceof TRPCError &&
        (error.code === 'BAD_GATEWAY' || error.code === 'TIMEOUT')
    ) {
        return {
            code: 'PROVIDER_UNAVAILABLE',
            message: 'Product history collection failed. Retry the request shortly.',
        };
    }

    return {
        code: 'INTERNAL_ERROR',
        message: 'Product history collection failed.',
    };
};
