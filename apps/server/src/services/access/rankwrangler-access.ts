import {
    createAccessSnapshotClient,
    createCloudflareAssertionVerifier,
    createCloudflareProjectionHandler,
    createCloudflareServiceAccess,
    ServiceAccessError,
} from '@merchbaseco/access';
import { createDevCloudflareAccess, DEV_ACCESS_AUTHORITY_ORIGIN } from '@merchbaseco/access/dev';
import { and, eq } from 'drizzle-orm';
import { type Database, db } from '@/db/index';
import { rankwranglerServiceAccounts } from '@/db/service-account-schema';
import { createRankWranglerAccessProjectionStore } from './access-projection-store';
import { createInternalAccess } from './internal-access';
import { createLocalGrantDeadline } from './local-grant';
import { createRankWranglerRequestAccess } from './request-access';

export type RankWranglerServicePrincipal = Omit<
    typeof rankwranglerServiceAccounts.$inferSelect,
    'merchbaseUserId'
> & {
    merchbaseUserId: string;
};

export interface CreateRankWranglerAccessOptions {
    database?: Database;
    databaseUrl: string;
    issuer: string;
    authorityOrigin: string;
    interactiveAudience: string;
    apiAudience: string;
    internalAudience: string;
    serviceClientId: string;
    serviceClientSecret: string;
    authorityClientId: string;
    bidbeaconClientId?: string;
}

export const createRankWranglerAccess = async ({
    database = db,
    ...options
}: CreateRankWranglerAccessOptions) => {
    const projections = createRankWranglerAccessProjectionStore(
        database,
        process.env.NODE_ENV === 'development'
            ? DEV_ACCESS_AUTHORITY_ORIGIN
            : options.authorityOrigin
    );
    const common = {
        projections,
        resolveServicePrincipal: (input: { merchbaseUserId: string }) =>
            resolveRankWranglerServicePrincipal(database, input),
        service: 'rankwrangler' as const,
    };
    const development =
        process.env.NODE_ENV === 'development'
            ? await createDevCloudflareAccess({ ...common, databaseUrl: options.databaseUrl })
            : null;
    const shared = {
        ...common,
        issuer: options.issuer,
        authorityOrigin: options.authorityOrigin,
        loadSnapshot: createAccessSnapshotClient({
            service: 'rankwrangler',
            issuer: options.issuer,
            authorityOrigin: options.authorityOrigin,
            clientId: options.serviceClientId,
            clientSecret: options.serviceClientSecret,
        }),
    };
    const sessionAccess =
        development ??
        createCloudflareServiceAccess({
            ...shared,
            acceptedPrincipalKinds: ['person'],
            verifier: createCloudflareAssertionVerifier({
                issuer: options.issuer,
                audience: options.interactiveAudience,
            }),
        });
    const apiVerifier = createCloudflareAssertionVerifier({
        issuer: options.issuer,
        audience: options.apiAudience,
        maxMachineLifetimeSeconds: 600,
    });
    const oauthAccess =
        development ??
        createCloudflareServiceAccess({
            ...shared,
            maxConnectionLifetimeSeconds: 300,
            acceptedPrincipalKinds: ['person'],
            verifier: apiVerifier,
        });
    const apiKeyAccess =
        development ??
        createCloudflareServiceAccess({
            ...shared,
            maxConnectionLifetimeSeconds: 300,
            acceptedPrincipalKinds: ['api_key'],
            verifier: apiVerifier,
        });
    const publicAccess =
        development ??
        createCloudflareServiceAccess({
            ...shared,
            maxConnectionLifetimeSeconds: 300,
            acceptedPrincipalKinds: ['person', 'api_key'],
            verifier: apiVerifier,
        });
    const grantDeadline = createLocalGrantDeadline(
        projections,
        development ? DEV_ACCESS_AUTHORITY_ORIGIN : options.authorityOrigin
    );

    return {
        projections,
        sessionAccess,
        oauthAccess,
        apiKeyAccess,
        grantDeadline,
        authorizeRequest: createRankWranglerRequestAccess({
            sessionAccess,
            publicAccess,
            development,
            internal: options.bidbeaconClientId
                ? createInternalAccess({
                      database,
                      issuer: options.issuer,
                      bidbeaconClientId: options.bidbeaconClientId,
                      access: publicAccess,
                      grantDeadline,
                      internalVerifier: createCloudflareAssertionVerifier({
                          issuer: options.issuer,
                          audience: options.internalAudience,
                          maxLifetimeSeconds: 600,
                      }),
                  })
                : undefined,
        }),
        projectionHandler: (onChanged: (uid: string) => Promise<void> | void) =>
            createCloudflareProjectionHandler({
                ...common,
                issuer: options.issuer,
                authorityOrigin: options.authorityOrigin,
                authorityClientId: options.authorityClientId,
                verifier: createCloudflareAssertionVerifier({
                    issuer: options.issuer,
                    audience: options.internalAudience,
                    maxLifetimeSeconds: 600,
                }),
                onChanged,
            }),
    };
};

export type RankWranglerAccess = Awaited<ReturnType<typeof createRankWranglerAccess>>;
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

    return { ...rows[0], merchbaseUserId };
};
