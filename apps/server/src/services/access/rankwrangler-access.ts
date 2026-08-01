import {
    type ClerkAuthenticatorOptions,
    createClerkAuthenticator,
    createServiceAccess,
    ServiceAccessError,
} from '@merchbaseco/access';
import { and, eq } from 'drizzle-orm';
import { type Database, db } from '@/db/index';
import { rankwranglerServiceAccounts } from '@/db/service-account-schema';
import { createRankWranglerAccessProjectionStore } from './access-projection-store';

export type RankWranglerServicePrincipal = Omit<
    typeof rankwranglerServiceAccounts.$inferSelect,
    'merchbaseUserId'
> & {
    merchbaseUserId: string;
};

export interface CreateRankWranglerAccessOptions extends ClerkAuthenticatorOptions {
    database?: Database;
    oauthAudience?: string;
}

export const createRankWranglerAccess = ({
    database = db,
    oauthAudience,
    ...authenticatorOptions
}: CreateRankWranglerAccessOptions) => {
    const authenticator = createClerkAuthenticator(authenticatorOptions);
    const projections = createRankWranglerAccessProjectionStore(database);
    const common = {
        authenticator,
        projections,
        resolveServicePrincipal: (input: { merchbaseUserId: string }) =>
            resolveRankWranglerServicePrincipal(database, input),
        service: 'rankwrangler' as const,
    };

    return {
        apiKeyAccess: createServiceAccess({
            ...common,
            acceptedCredentialKinds: ['api_key'],
        }),
        authenticator,
        oauthAccess: createServiceAccess({
            ...common,
            acceptedCredentialKinds: ['oauth'],
            oauthAudience,
        }),
        projections,
        sessionAccess: createServiceAccess({
            ...common,
            acceptedCredentialKinds: ['session'],
        }),
    };
};

export type RankWranglerAccess = ReturnType<typeof createRankWranglerAccess>;

let runtimeAccess: RankWranglerAccess | null = null;

export const configureRankWranglerAccess = (access: RankWranglerAccess) => {
    runtimeAccess = access;
};

export const getConfiguredRankWranglerAccess = () => {
    if (!runtimeAccess) {
        throw new Error('RankWrangler access has not been configured.');
    }
    return runtimeAccess;
};

export const resolveRankWranglerServicePrincipal = async (
    database: Database,
    { merchbaseUserId }: { merchbaseUserId: string }
): Promise<RankWranglerServicePrincipal> => {
    if (!merchbaseUserId.startsWith('mbu_')) {
        throw new ServiceAccessError('access_unavailable');
    }

    let rows = await database
        .select()
        .from(rankwranglerServiceAccounts)
        .where(
            and(
                eq(rankwranglerServiceAccounts.service, 'rankwrangler'),
                eq(rankwranglerServiceAccounts.merchbaseUserId, merchbaseUserId)
            )
        )
        .limit(2);

    if (rows.length === 0) {
        await database
            .insert(rankwranglerServiceAccounts)
            .values({
                merchbaseUserId,
                service: 'rankwrangler',
            })
            .onConflictDoNothing();
        rows = await database
            .select()
            .from(rankwranglerServiceAccounts)
            .where(
                and(
                    eq(rankwranglerServiceAccounts.service, 'rankwrangler'),
                    eq(rankwranglerServiceAccounts.merchbaseUserId, merchbaseUserId)
                )
            )
            .limit(2);
    }

    if (rows.length !== 1 || !rows[0]) {
        throw new ServiceAccessError('access_unavailable');
    }

    return rows[0] as RankWranglerServicePrincipal;
};
