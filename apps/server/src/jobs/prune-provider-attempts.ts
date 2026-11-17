import { z } from 'zod';
import { deleteExpiredKeepaCapacityAttempts } from '@/db/keepa-capacity-retention';
import { defineJob } from '@/jobs/job-router';
import { deleteExpiredProviderAttempts } from '@/services/providers/provider-telemetry';

const PROVIDER_ATTEMPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PROVIDER_ATTEMPT_DELETE_BATCH_SIZE = 10_000;
const PROVIDER_ATTEMPT_DELETE_MAX_BATCHES = 10;

type DeleteBatch = (input: { before: Date; batchSize: number }) => Promise<number>;

interface PruneProviderAttemptsDeps {
    deleteBatch: DeleteBatch;
    deleteKeepaCapacityBatch: DeleteBatch;
    now: () => Date;
}

const defaultDeps: PruneProviderAttemptsDeps = {
    deleteBatch: deleteExpiredProviderAttempts,
    deleteKeepaCapacityBatch: deleteExpiredKeepaCapacityAttempts,
    now: () => new Date(),
};

/** Deletes provider attempts and Keepa capacity attempts older than seven days, in bounded batches. */
export const pruneProviderAttempts = async (overrides: Partial<PruneProviderAttemptsDeps> = {}) => {
    const deps = { ...defaultDeps, ...overrides };
    const before = new Date(deps.now().getTime() - PROVIDER_ATTEMPT_RETENTION_MS);
    const attempts = await deleteBounded(deps.deleteBatch, before);
    const keepaCapacity = await deleteBounded(deps.deleteKeepaCapacityBatch, before);
    return {
        didWork: attempts.deletedCount + keepaCapacity.deletedCount > 0,
        deletedCount: attempts.deletedCount,
        keepaCapacityDeletedCount: keepaCapacity.deletedCount,
        reachedDeleteLimit: attempts.reachedDeleteLimit || keepaCapacity.reachedDeleteLimit,
    };
};

export const pruneProviderAttemptsJob = defineJob('prune-provider-attempts', {
    startupSummary: 'daily seven-day Provider-attempt and Keepa capacity-attempt retention cleanup',
    persistSuccess: 'didWork',
})
    .input(z.object({}))
    .options({ singletonKey: 'prune-provider-attempts' })
    .cron({ cron: '30 2 * * *', payload: {} })
    .work(async (_job, _signal, log) => {
        const result = await pruneProviderAttempts();
        if (result.didWork) {
            log('Pruned expired Provider attempts', result);
        }
        if (result.reachedDeleteLimit) {
            log('Provider-attempt cleanup reached its bounded delete limit', result, 'warn');
        }
        return result;
    });

const deleteBounded = async (deleteBatch: DeleteBatch, before: Date) => {
    let deletedCount = 0;
    let batchCount = 0;
    while (batchCount < PROVIDER_ATTEMPT_DELETE_MAX_BATCHES) {
        const deleted = await deleteBatch({
            before,
            batchSize: PROVIDER_ATTEMPT_DELETE_BATCH_SIZE,
        });
        deletedCount += deleted;
        batchCount += 1;
        if (deleted < PROVIDER_ATTEMPT_DELETE_BATCH_SIZE) {
            break;
        }
    }
    return {
        deletedCount,
        reachedDeleteLimit:
            deletedCount ===
            PROVIDER_ATTEMPT_DELETE_BATCH_SIZE * PROVIDER_ATTEMPT_DELETE_MAX_BATCHES,
    };
};
