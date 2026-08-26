/**
 * The closed vocabularies an activity event is filtered by.
 *
 * They live apart from `event-logs.ts` because that module opens a database
 * connection on import. Anything that only needs to know the shape of the
 * vocabulary — API input schemas, the development seed and its coverage
 * contract — can read it here without pulling in configuration or a client.
 */

export const eventLogLevels = ['info', 'warn', 'error', 'debug'] as const;
export const eventLogStatuses = ['success', 'failed', 'pending', 'retrying', 'partial'] as const;
export const eventLogPrimitiveTypes = ['product', 'history', 'job'] as const;

export type EventLogLevel = (typeof eventLogLevels)[number];
export type EventLogStatus = (typeof eventLogStatuses)[number];
export type EventLogPrimitiveType = (typeof eventLogPrimitiveTypes)[number];
