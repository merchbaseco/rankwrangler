import type { OperationRecord } from '@/services/operations';

export type CatalogSearchResolution =
    | { kind: 'ready'; runId: string }
    | {
          kind: 'pending';
          operation: Extract<OperationRecord, { type: 'catalogSearch' }>;
          created: boolean;
          staleRunId?: string | null;
      }
    | {
          kind: 'cooldown';
          retryAfterSeconds: number;
          staleRunId?: string | null;
      }
    | {
          kind: 'billingRejected';
          reason: 'serviceAccountNotFound' | 'usageLimitExceeded';
          usageLimit: number | null;
      };
