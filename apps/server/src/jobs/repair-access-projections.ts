import { ServiceAccessError } from '@merchbaseco/access';
import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { type Database, db } from '@/db/index';
import { rankwranglerServiceAccounts } from '@/db/service-account-schema';
import { getConfiguredRankWranglerAccess } from '@/services/access/rankwrangler-access';
import { defineJob } from './job-router';

export interface AccessProjectionRepairDeps {
    findMappedUsers: () => Promise<string[]>;
    refreshAccess: (merchbaseUserId: string) => Promise<unknown>;
}

const defaultDeps = (database: Database = db): AccessProjectionRepairDeps => ({
    findMappedUsers: async () => {
        const rows = await database
            .select({ merchbaseUserId: rankwranglerServiceAccounts.merchbaseUserId })
            .from(rankwranglerServiceAccounts)
            .where(
                and(
                    eq(rankwranglerServiceAccounts.service, 'rankwrangler'),
                    isNotNull(rankwranglerServiceAccounts.merchbaseUserId)
                )
            )
            .orderBy(rankwranglerServiceAccounts.id);

        return rows.flatMap(row => (row.merchbaseUserId ? [row.merchbaseUserId] : []));
    },
    refreshAccess: merchbaseUserId =>
        getConfiguredRankWranglerAccess().sessionAccess.refreshAccess(merchbaseUserId),
});

export const repairAccessProjections = async (deps: AccessProjectionRepairDeps = defaultDeps()) => {
    const merchbaseUserIds = await deps.findMappedUsers();
    let refreshed = 0;
    let denied = 0;
    let unavailable = 0;

    for (const merchbaseUserId of merchbaseUserIds) {
        try {
            await deps.refreshAccess(merchbaseUserId);
            refreshed += 1;
        } catch (error) {
            if (error instanceof ServiceAccessError && error.code === 'access_denied') {
                denied += 1;
            } else {
                unavailable += 1;
            }
        }
    }

    return {
        didWork: merchbaseUserIds.length > 0,
        denied,
        refreshed,
        unavailable,
    } as const;
};

export const repairAccessProjectionsJob = defineJob('repair-access-projections', {
    startupSummary: 'daily centralized access projection repair at 03:15 UTC',
})
    .input(z.object({}))
    .cron({ cron: '15 3 * * *' })
    .work(async () => await repairAccessProjections());
