import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { accessProjection, accessProjectionEvents, rankwranglerServiceAccounts } from '@/db/schema';
import { consumeRankWranglerServiceAccountUsage } from '@/db/service-account-usage';
import { createRankWranglerAccessProjectionStore } from '@/services/access/access-projection-store';
import { resolveRankWranglerServicePrincipal } from '@/services/access/rankwrangler-access';

const isDedicatedCatalogTestDatabase =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test';
const describeCatalogDb = isDedicatedCatalogTestDatabase ? describe : describe.skip;
const ISSUER = 'https://access-internal.merchbase.co';
const SUBJECT = 'mbu_projection_test';
const MERCHBASE_USER_ID = 'mbu_projection_test';
const SERVICE_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';

describeCatalogDb('Centralized access persistence', () => {
    it('preserves event order, idempotency, unique mapping, and tombstones', async () => {
        await clearAccessTables();
        const store = createRankWranglerAccessProjectionStore(db);

        await store.apply({
            eventId: 'projection-new',
            projection: {
                access: 'granted',
                accessValidUntil: null,
                issuer: ISSUER,
                merchbaseUserId: MERCHBASE_USER_ID,
                sourceUpdatedAt: 2000,
                subject: SUBJECT,
            },
            type: 'upsert',
        });
        await store.apply({
            eventId: 'projection-old',
            projection: {
                access: 'not_granted',
                accessValidUntil: null,
                issuer: ISSUER,
                merchbaseUserId: MERCHBASE_USER_ID,
                sourceUpdatedAt: 1000,
                subject: SUBJECT,
            },
            type: 'upsert',
        });
        await store.apply({
            eventId: 'projection-new',
            projection: {
                access: 'not_granted',
                accessValidUntil: null,
                issuer: ISSUER,
                merchbaseUserId: MERCHBASE_USER_ID,
                sourceUpdatedAt: 3000,
                subject: SUBJECT,
            },
            type: 'upsert',
        });

        expect(await store.findByIdentity({ issuer: ISSUER, subject: SUBJECT })).toEqual({
            type: 'active',
            projection: {
                access: 'granted',
                accessValidUntil: null,
                issuer: ISSUER,
                merchbaseUserId: MERCHBASE_USER_ID,
                sourceUpdatedAt: 2000,
                subject: SUBJECT,
            },
        });
        expect(await store.findByMerchbaseUserId(MERCHBASE_USER_ID)).not.toBeNull();

        await store.apply({
            eventId: 'projection-delete',
            identity: { issuer: ISSUER, subject: SUBJECT },
            sourceUpdatedAt: Number.MAX_SAFE_INTEGER,
            type: 'remove',
        });

        expect(await store.findByIdentity({ issuer: ISSUER, subject: SUBJECT })).toEqual({
            type: 'tombstone',
        });
        expect(await store.findByMerchbaseUserId(MERCHBASE_USER_ID)).toBeNull();
        expect(
            await db
                .select({ eventId: accessProjectionEvents.eventId })
                .from(accessProjectionEvents)
                .where(eq(accessProjectionEvents.issuer, ISSUER))
        ).toHaveLength(3);
    });

    it('stores canonical access with a person and two keys, preserving retirement and ownership', async () => {
        await clearAccessTables();
        const { applyAccessSnapshot, createCloudflareServiceAccess } = await import(
            '@merchbaseco/access'
        );
        const store = createRankWranglerAccessProjectionStore(db);
        await db.insert(rankwranglerServiceAccounts).values({
            id: SERVICE_ACCOUNT_ID,
            merchbaseUserId: MERCHBASE_USER_ID,
            usageToday: 1,
            usageCount: 10,
            usageLimit: 100,
        });
        const snapshot = {
            issuer: 'https://example.cloudflareaccess.com',
            service: 'rankwrangler' as const,
            merchbaseUserId: MERCHBASE_USER_ID,
            access: 'granted' as const,
            accessValidUntil: null,
            sourceUpdatedAt: 100,
            eventId: 'cloudflare-initial',
            identities: [
                { kind: 'person' as const, subject: 'person-one', state: 'active' as const },
                {
                    kind: 'api_key' as const,
                    subject: 'key-one.access',
                    state: 'active' as const,
                    expiresAt: null,
                },
                {
                    kind: 'api_key' as const,
                    subject: 'key-two.access',
                    state: 'active' as const,
                    expiresAt: null,
                },
            ],
        };
        const apply = (value: unknown) =>
            applyAccessSnapshot({
                authorityOrigin: ISSUER,
                issuer: snapshot.issuer,
                service: 'rankwrangler',
                projections: store,
                snapshot: value,
            });
        await apply(snapshot);
        expect(await db.select().from(accessProjection)).toHaveLength(4);
        expect((await store.findByMerchbaseUserId(MERCHBASE_USER_ID))?.access).toBe('granted');
        const access = createCloudflareServiceAccess({
            issuer: snapshot.issuer,
            authorityOrigin: ISSUER,
            service: 'rankwrangler',
            acceptedPrincipalKinds: ['person', 'api_key'],
            projections: store,
            loadSnapshot: () =>
                Promise.reject(new Error('Warm identities cannot call the authority')),
            resolveServicePrincipal: input => resolveRankWranglerServicePrincipal(db, input),
            verifier: {
                verify: token =>
                    Promise.resolve(
                        token === 'person-one'
                            ? {
                                  kind: 'person' as const,
                                  subject: token,
                                  issuer: snapshot.issuer,
                                  issuedAt: Date.now() - 1000,
                                  expiresAt: Date.now() + 300_000,
                              }
                            : {
                                  kind: 'machine' as const,
                                  clientId: token,
                                  issuer: snapshot.issuer,
                                  issuedAt: Date.now() - 1000,
                                  expiresAt: Date.now() + 300_000,
                              }
                    ),
            },
        });
        for (const token of ['person-one', 'key-one.access', 'key-two.access']) {
            expect((await access.authorize(token)).principal.id).toBe(SERVICE_ACCOUNT_ID);
        }
        await apply({
            ...snapshot,
            sourceUpdatedAt: 200,
            eventId: 'cloudflare-key-retired',
            identities: snapshot.identities.map(identity =>
                identity.subject === 'key-one.access' ? { ...identity, state: 'retired' } : identity
            ),
        });
        await expect(access.authorize('key-one.access')).rejects.toMatchObject({
            code: 'access_denied',
        });
        expect((await access.authorize('key-two.access')).merchbaseUserId).toBe(MERCHBASE_USER_ID);
        await apply({
            ...snapshot,
            sourceUpdatedAt: 300,
            eventId: 'cloudflare-revoked',
            access: 'not_granted',
        });
        await apply({ ...snapshot, eventId: 'cloudflare-delayed-initial' });
        await expect(access.authorize('key-two.access')).rejects.toMatchObject({
            code: 'access_denied',
        });
        expect(await db.select().from(rankwranglerServiceAccounts)).toMatchObject([
            {
                id: SERVICE_ACCOUNT_ID,
                merchbaseUserId: MERCHBASE_USER_ID,
                usageToday: 1,
                usageCount: 10,
            },
        ]);
    });

    it('debits the fixed service account atomically and resets only the daily counter', async () => {
        await clearAccessTables();
        const now = new Date('2026-08-01T12:00:00.000Z');
        await db.insert(rankwranglerServiceAccounts).values({
            id: SERVICE_ACCOUNT_ID,
            merchbaseUserId: MERCHBASE_USER_ID,
            usageToday: 1,
            usageCount: 10,
            usageLimit: 2,
            lastResetAt: now,
        });

        expect(
            await db.transaction(transaction =>
                consumeRankWranglerServiceAccountUsage(transaction, SERVICE_ACCOUNT_ID, 1, now)
            )
        ).toEqual({ kind: 'consumed' });
        expect(
            await db.transaction(transaction =>
                consumeRankWranglerServiceAccountUsage(transaction, SERVICE_ACCOUNT_ID, 1, now)
            )
        ).toEqual({ kind: 'rejected', reason: 'usageLimitExceeded', usageLimit: 2 });

        await db
            .update(rankwranglerServiceAccounts)
            .set({
                lastResetAt: new Date('2026-07-31T23:59:00.000Z'),
                usageToday: 2,
            })
            .where(eq(rankwranglerServiceAccounts.id, SERVICE_ACCOUNT_ID));
        expect(
            await db.transaction(transaction =>
                consumeRankWranglerServiceAccountUsage(transaction, SERVICE_ACCOUNT_ID, 1, now)
            )
        ).toEqual({ kind: 'consumed' });

        const [account] = await db
            .select()
            .from(rankwranglerServiceAccounts)
            .where(eq(rankwranglerServiceAccounts.id, SERVICE_ACCOUNT_ID));
        expect(account).toMatchObject({ usageToday: 1, usageCount: 12 });
    });

    it('allows separate RankWrangler service accounts for separate Merchbase users', async () => {
        await clearAccessTables();
        await db.insert(rankwranglerServiceAccounts).values([
            {
                id: '55555555-5555-4555-8555-555555555551',
                merchbaseUserId: 'mbu_first_service_account',
            },
            {
                id: '55555555-5555-4555-8555-555555555552',
                merchbaseUserId: 'mbu_second_service_account',
            },
        ]);

        expect(await db.select().from(rankwranglerServiceAccounts)).toHaveLength(2);
    });

    it('lazily provisions one service account for a newly authorized Merchbase user', async () => {
        await clearAccessTables();

        const first = await resolveRankWranglerServicePrincipal(db, {
            merchbaseUserId: 'mbu_lazy_service_account',
        });
        const second = await resolveRankWranglerServicePrincipal(db, {
            merchbaseUserId: 'mbu_lazy_service_account',
        });

        expect(first.id).toBe(second.id);
        expect(first.merchbaseUserId).toBe('mbu_lazy_service_account');
        expect(await db.select().from(rankwranglerServiceAccounts)).toHaveLength(1);
    });
});

const clearAccessTables = async () => {
    await db.delete(accessProjectionEvents);
    await db.delete(accessProjection);
    await db.delete(rankwranglerServiceAccounts);
};
