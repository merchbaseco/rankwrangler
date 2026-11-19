import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
    createCloudflareAssertionVerifier,
    createCloudflareServiceAccess,
} from '@merchbaseco/access';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { eq, sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { createRequestContext } from '@/api/context';
import { createProductGetManyProcedure } from '@/api/public/product-get-many';
import { router } from '@/api/trpc';
import { accessDelegationAudit } from '@/db/access-delegation-audit-schema';
import { db } from '@/db/index';
import { accessProjection, accessProjectionEvents, rankwranglerServiceAccounts } from '@/db/schema';
import { createRankWranglerAccessProjectionStore } from '@/services/access/access-projection-store';
import {
    createInternalAccess,
    INTERNAL_HOST,
    INTERNAL_PRODUCT_PATH,
    registerInternalRouteBoundary,
} from '@/services/access/internal-access';
import { createLocalGrantDeadline } from '@/services/access/local-grant';
import { resolveRankWranglerServicePrincipal } from '@/services/access/rankwrangler-access';
import { createRankWranglerRequestAccess } from '@/services/access/request-access';

const dedicated =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test';
const issuer = 'https://example.cloudflareaccess.com';
const authorityOrigin = 'https://access-internal.merchbase.co';
const audience = 'rankwrangler-internal-test';
const uid = 'mbu_bidbeacon_integration';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const assertion = (claims: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const data = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: issuer, aud: audience, type: 'app', sub: '', common_name: 'bidbeacon-client', iat: now, exp: now + 300, ...claims })}`;
    return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
};

describe.skipIf(!dedicated)('Delegated product lookup', () => {
    test('BidBeacon internal lookup validates signed identity, local grant and durable audit before metered getMany', async () => {
        await db.delete(accessDelegationAudit);
        await db.delete(accessProjectionEvents);
        await db.delete(accessProjection);
        await db.delete(rankwranglerServiceAccounts);
        const projections = createRankWranglerAccessProjectionStore(db, authorityOrigin);
        await projections.apply({
            type: 'upsert',
            eventId: 'internal-grant',
            projection: {
                issuer: authorityOrigin,
                subject: uid,
                merchbaseUserId: uid,
                access: 'granted',
                accessValidUntil: null,
                sourceUpdatedAt: 1,
            },
        });
        const verifier = createCloudflareAssertionVerifier(
            { issuer, audience, maxLifetimeSeconds: 600 },
            () => Promise.resolve(publicKey)
        );
        const access = createCloudflareServiceAccess({
            issuer,
            authorityOrigin,
            service: 'rankwrangler',
            projections,
            verifier,
            acceptedPrincipalKinds: ['person', 'api_key'],
            resolveServicePrincipal: input => resolveRankWranglerServicePrincipal(db, input),
            loadSnapshot: () =>
                Promise.reject(new Error('No network snapshot in delegated requests')),
        });
        const internal = createInternalAccess({
            database: db,
            issuer,
            access,
            internalVerifier: verifier,
            bidbeaconClientId: 'bidbeacon-client',
            grantDeadline: createLocalGrantDeadline(projections, authorityOrigin),
        });
        const authorizeRequest = createRankWranglerRequestAccess({
            sessionAccess: access,
            publicAccess: access,
            development: null,
            internal,
        });
        let businessCalls = 0;
        const procedure = createProductGetManyProcedure({
            getBasicProductReadModels: () => {
                businessCalls++;
                return Promise.resolve([]);
            },
            consumeServiceAccountUsageForRequest: async (context, count) => {
                expect(context.credentialKind).toBe('service_delegated');
                expect(context.isAdmin).toBe(false);
                expect(context.accessPrincipal?.merchbaseUserId).toBe(uid);
                const { consumeServiceAccountUsageForRequest } = await import(
                    '@/api/public/consume-service-account-usage'
                );
                await consumeServiceAccountUsageForRequest(context, count);
            },
        });
        const app = Fastify();
        registerInternalRouteBoundary(app);
        await app.register(fastifyTRPCPlugin, {
            prefix: '/api',
            trpcOptions: {
                router: router({
                    api: router({ public: router({ product: router({ getMany: procedure }) }) }),
                }),
                createContext: ({ req }) =>
                    createRequestContext(
                        { headers: req.headers, method: req.method, url: req.raw.url },
                        { authorizeRequest }
                    ),
            },
        });
        const products = [{ marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' }];
        const request = (
            options: {
                url?: string;
                method?: 'POST' | 'GET';
                token?: string;
                user?: string;
                body?: unknown;
                host?: string;
            } = {}
        ) =>
            app.inject({
                method: options.method ?? 'POST',
                url: options.url ?? INTERNAL_PRODUCT_PATH,
                headers: {
                    host: options.host ?? INTERNAL_HOST,
                    'content-type': 'application/json',
                    'cf-access-jwt-assertion': options.token ?? assertion(),
                    'x-merchbase-user-id': options.user ?? uid,
                },
                ...(options.method === 'GET' ? {} : { payload: options.body ?? { products } }),
            });
        try {
            const response = await request();
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({ result: { data: [] } });
            expect(businessCalls).toBe(1);
            const [account] = await db
                .select()
                .from(rankwranglerServiceAccounts)
                .where(eq(rankwranglerServiceAccounts.merchbaseUserId, uid));
            expect(account?.usageCount).toBe(1);
            const audits = await db.select().from(accessDelegationAudit);
            expect(audits).toHaveLength(1);
            expect(audits[0]).toMatchObject({
                caller: 'bidbeacon',
                receiver: 'rankwrangler',
                merchbaseUserId: uid,
                route: `POST ${INTERNAL_PRODUCT_PATH}`,
                outcome: 'allowed',
            });
            for (const bad of [
                { token: assertion({ aud: 'public-suite' }) },
                { token: assertion({ common_name: 'other-service' }) },
                { token: assertion({ sub: 'person', common_name: '' }) },
                { token: assertion({ exp: Math.floor(Date.now() / 1000) + 900 }) },
                { user: 'user_legacy' },
                { user: 'mbu_invalid!' },
                { host: 'rankwrangler-api.merchbase.co' },
                { host: 'rankwrangler.merchbase.co' },
                { host: 'rankwrangler-internal.merchbase.co:443' },
            ]) {
                expect((await request(bad)).statusCode).not.toBe(200);
            }
            for (const bad of [
                { method: 'GET' as const },
                { url: `${INTERNAL_PRODUCT_PATH}?batch=1` },
                { url: `${INTERNAL_PRODUCT_PATH},api.app.product.get` },
                { url: '/api/api.app.product.get' },
                { url: '/api/api.public.product%2EgetMany' },
                { url: `${INTERNAL_PRODUCT_PATH}/` },
                { url: `${INTERNAL_PRODUCT_PATH}?route=api.public.product.getMany` },
            ]) {
                expect((await request(bad)).statusCode).toBe(404);
            }
            expect((await request({ body: { '0': { products } } })).statusCode).toBe(400);
            expect((await request({ body: [{ products }] })).statusCode).toBe(400);
            expect(businessCalls).toBe(1);
            await db.execute(
                sql`ALTER TABLE access_delegation_audit RENAME TO access_delegation_audit_offline`
            );
            try {
                expect((await request()).statusCode).toBe(503);
            } finally {
                await db.execute(
                    sql`ALTER TABLE access_delegation_audit_offline RENAME TO access_delegation_audit`
                );
            }
            expect(businessCalls).toBe(1);
            await projections.apply({
                type: 'tombstone',
                eventId: 'internal-revoke',
                identity: { issuer: authorityOrigin, subject: uid },
                sourceUpdatedAt: 2,
            });
            expect((await request()).statusCode).toBe(403);
            expect(businessCalls).toBe(1);
            expect(
                (
                    await db
                        .select()
                        .from(rankwranglerServiceAccounts)
                        .where(eq(rankwranglerServiceAccounts.merchbaseUserId, uid))
                )[0]?.usageCount
            ).toBe(1);
            expect(
                (await db.select().from(accessDelegationAudit)).some(
                    record => record.outcome === 'access_denied'
                )
            ).toBe(true);
        } finally {
            await app.close();
        }
    });
});
