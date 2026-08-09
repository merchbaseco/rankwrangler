import { z } from 'zod';
import { defineJob } from '@/jobs/job-router';
import { deleteExpiredProviderAttempts } from '@/services/providers/provider-telemetry';

const PROVIDER_ATTEMPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PROVIDER_ATTEMPT_DELETE_BATCH_SIZE = 10_000;
const PROVIDER_ATTEMPT_DELETE_MAX_BATCHES = 10;

interface PruneProviderAttemptsDeps {
    deleteBatch: typeof deleteExpiredProviderAttempts;
    now: () => Date;
}

const defaultDeps: PruneProviderAttemptsDeps = {
    deleteBatch: deleteExpiredProviderAttempts,
    now: () => new Date(),
};

export const pruneProviderAttempts = async (overrides: Partial<PruneProviderAttemptsDeps> = {}) => {
    const deps = { ...defaultDeps, ...overrides };
    const before = new Date(deps.now().getTime() - PROVIDER_ATTEMPT_RETENTION_MS);
    let deletedCount = 0;
    let batchCount = 0;

    while (batchCount < PROVIDER_ATTEMPT_DELETE_MAX_BATCHES) {
        const deleted = await deps.deleteBatch({
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
        didWork: deletedCount > 0,
        deletedCount,
        reachedDeleteLimit:
            batchCount === PROVIDER_ATTEMPT_DELETE_MAX_BATCHES &&
            deletedCount ===
                PROVIDER_ATTEMPT_DELETE_BATCH_SIZE * PROVIDER_ATTEMPT_DELETE_MAX_BATCHES,
    };
};

export const pruneProviderAttemptsJob = defineJob('prune-provider-attempts', {
    startupSummary: 'daily seven-day Provider-attempt retention cleanup',
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
