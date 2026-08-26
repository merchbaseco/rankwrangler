/**
 * Every row the seed writes is marked in its own primary key, and every
 * fabricated ASIN is marked in its own text. That marking is what makes a
 * re-run idempotent without a `truncate`: the writer deletes exactly the rows
 * a previous seed wrote and leaves anything a developer collected by hand.
 *
 * Ids are minted from a counter rather than the RNG, so the same row occupies
 * the same id across seeds and a re-run with a different seed replaces cleanly.
 */

/** Reads as "de-seed". Chosen so a marked row is obvious in a query result. */
export const DEV_SEED_UUID_PREFIX = 'de5eed00';

/** Ten characters, the ASIN shape, in a range Amazon does not mint. */
export const DEV_SEED_ASIN_PREFIX = 'B0DEV';

/** Matches every id the seed has ever minted, for the clear step. */
export const DEV_SEED_UUID_LIKE = `${DEV_SEED_UUID_PREFIX}-%`;

export const DEV_SEED_ASIN_LIKE = `${DEV_SEED_ASIN_PREFIX}%`;

export type DevSeedEntity =
    | 'product'
    | 'facetValue'
    | 'category'
    | 'historyPoint'
    | 'historyImport'
    | 'catalogQuery'
    | 'catalogRun'
    | 'catalogResult'
    | 'operation'
    | 'dataset'
    | 'snapshot'
    | 'keyword'
    | 'eventLog'
    | 'jobExecution'
    | 'jobExecutionLog'
    | 'providerAttempt';

const ENTITY_LANES: Record<DevSeedEntity, number> = {
    product: 1,
    facetValue: 2,
    category: 3,
    historyPoint: 4,
    historyImport: 5,
    catalogQuery: 6,
    catalogRun: 7,
    catalogResult: 8,
    operation: 9,
    dataset: 10,
    snapshot: 11,
    keyword: 12,
    eventLog: 13,
    jobExecution: 14,
    jobExecutionLog: 15,
    providerAttempt: 16,
};

const LANE_STRIDE = 100_000_000;

export interface DevSeedIdMinter {
    (entity: DevSeedEntity): string;
}

export const createIdMinter = (): DevSeedIdMinter => {
    const counters = new Map<DevSeedEntity, number>();

    return (entity: DevSeedEntity) => {
        const next = (counters.get(entity) ?? 0) + 1;
        counters.set(entity, next);
        const ordinal = ENTITY_LANES[entity] * LANE_STRIDE + next;
        return `${DEV_SEED_UUID_PREFIX}-0000-4000-8000-${ordinal.toString(16).padStart(12, '0')}`;
    };
};

/** `B0DEV` plus a zero-padded ordinal, so ASIN sort order matches catalog order. */
export const mintSeedAsin = (index: number) =>
    `${DEV_SEED_ASIN_PREFIX}${index.toString().padStart(5, '0')}`;
