import { TRPCError } from '@trpc/server';

export const operationTypes = ['productHistoryRefresh', 'catalogSearch'] as const;
export const operationStatuses = ['pending', 'completed'] as const;

export type ProductHistoryOperationInput = {
    marketplaceId: string;
    asin: string;
    days: 3650;
    ownerMerchbaseUserId: string;
};

export type ProductHistoryResource = {
    type: 'productHistory';
    marketplaceId: string;
    asin: string;
};

export type CatalogSearchOperationInput = {
    queryId: string;
    marketplaceId: 'ATVPDKIKX0DER';
    term: string;
    page: 0;
    priority: 'interactive' | 'scheduled';
    ownerMerchbaseUserId?: string;
};

export type CatalogSearchResource = {
    type: 'catalogSearchRun';
    queryId: string;
    runId: string;
};

export type OperationError = {
    code:
        | 'ACCESS_DENIED'
        | 'ACCESS_UNAVAILABLE'
        | 'PROVIDER_UNAVAILABLE'
        | 'RESOURCE_NOT_FOUND'
        | 'INTERNAL_ERROR';
    message: string;
};

type OperationRecordBase = {
    id: string;
    status: (typeof operationStatuses)[number];
    targetKey: string;
    error: OperationError | null;
    dispatchedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export type OperationRecord =
    | (OperationRecordBase & {
          type: 'productHistoryRefresh';
          input: ProductHistoryOperationInput;
          resource: ProductHistoryResource | null;
      })
    | (OperationRecordBase & {
          type: 'catalogSearch';
          input: CatalogSearchOperationInput;
          resource: CatalogSearchResource | null;
      });

type PublicOperationType = (typeof operationTypes)[number];

export type PublicOperation =
    | {
          id: string;
          type: PublicOperationType;
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
          type: 'catalogSearch';
          status: 'completed';
          resource: CatalogSearchResource;
          error: null;
          createdAt: string;
          updatedAt: string;
          completedAt: string;
      }
    | {
          id: string;
          type: PublicOperationType;
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
        if (operation.type === 'productHistoryRefresh') {
            return {
                ...common,
                type: operation.type,
                status: 'completed',
                resource: operation.resource,
                error: null,
                completedAt,
            };
        }
        return {
            ...common,
            type: operation.type,
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

export const sanitizeOperationError = (
    error: unknown,
    operationType: PublicOperationType = 'productHistoryRefresh'
): OperationError => {
    const isCatalogSearch = operationType === 'catalogSearch';

    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
        return {
            code: 'RESOURCE_NOT_FOUND',
            message: isCatalogSearch
                ? 'Catalog search is unavailable.'
                : 'Product history is unavailable for this Product.',
        };
    }

    if (error instanceof TRPCError && (error.code === 'BAD_GATEWAY' || error.code === 'TIMEOUT')) {
        return {
            code: 'PROVIDER_UNAVAILABLE',
            message: isCatalogSearch
                ? 'Catalog search failed. Retry the request shortly.'
                : 'Product history collection failed. Retry the request shortly.',
        };
    }

    return {
        code: 'INTERNAL_ERROR',
        message: isCatalogSearch ? 'Catalog search failed.' : 'Product history collection failed.',
    };
};
