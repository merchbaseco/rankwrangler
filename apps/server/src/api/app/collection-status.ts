import { adminProcedure } from '@/api/trpc';
import type { getCollectionStatus } from '@/services/collection-status';

export const createCollectionStatusProcedure = (
    readStatus: typeof getCollectionStatus = async () =>
        (await import('@/services/collection-status')).getCollectionStatus()
) => adminProcedure.query(async () => readStatus());

export const collectionStatus = createCollectionStatusProcedure();
