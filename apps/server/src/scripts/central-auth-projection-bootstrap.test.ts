import { describe, expect, it, mock } from 'bun:test';
import type {
    AccessProjection,
    AccessProjectionEvent,
    AccessProjectionStore,
} from '@merchbaseco/access';
import {
    bootstrapAccessProjection,
    parseProjectionBootstrapOptions,
} from './central-auth-projection-bootstrap';

const projection: AccessProjection = {
    access: 'granted',
    accessValidUntil: null,
    issuer: 'https://clerk.test',
    merchbaseUserId: 'mbu_test_123',
    sourceUpdatedAt: 1_700_000_000_000,
    subject: 'user_test_123',
};

describe('projection bootstrap', () => {
    it('loads exact Clerk metadata and applies it through the projection store', async () => {
        const events: AccessProjectionEvent[] = [];
        const store = createStore(events, projection);

        const result = await bootstrapAccessProjection(
            {
                clerkSubject: projection.subject,
                merchbaseUserId: projection.merchbaseUserId,
            },
            {
                authenticator: {
                    loadProjection: mock(async () => ({
                        projection,
                        sourceUpdatedAt: projection.sourceUpdatedAt,
                    })),
                },
                issuer: projection.issuer,
                now: () => projection.sourceUpdatedAt,
                store,
            }
        );

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ projection, type: 'upsert' });
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain(projection.subject);
        expect(serialized).not.toContain(projection.merchbaseUserId);
    });

    it('persists denied Clerk state before failing closed', async () => {
        for (const loadedProjection of [
            null,
            { ...projection, access: 'not_granted' as const },
            { ...projection, merchbaseUserId: 'mbu_other_123' },
        ]) {
            const events: AccessProjectionEvent[] = [];
            await expect(
                bootstrapAccessProjection(
                    {
                        clerkSubject: projection.subject,
                        merchbaseUserId: projection.merchbaseUserId,
                    },
                    {
                        authenticator: {
                            loadProjection: mock(async () => ({
                                projection: loadedProjection,
                                sourceUpdatedAt: projection.sourceUpdatedAt,
                            })),
                        },
                        issuer: projection.issuer,
                        now: () => projection.sourceUpdatedAt,
                        store: createStore(events, loadedProjection ?? projection),
                    }
                )
            ).rejects.toThrow(
                'Current Clerk metadata does not grant the exact requested identity.'
            );
            expect(events).toHaveLength(1);
            expect(events[0]?.type).toBe(loadedProjection ? 'upsert' : 'remove');
        }
    });

    it('fails when the persisted projection does not exactly match the Clerk response', async () => {
        await expect(
            bootstrapAccessProjection(
                {
                    clerkSubject: projection.subject,
                    merchbaseUserId: projection.merchbaseUserId,
                },
                {
                    authenticator: {
                        loadProjection: mock(async () => ({
                            projection,
                            sourceUpdatedAt: projection.sourceUpdatedAt,
                        })),
                    },
                    issuer: projection.issuer,
                    store: createStore([], { ...projection, sourceUpdatedAt: 1 }),
                }
            )
        ).rejects.toThrow('Stored projection does not exactly match current Clerk metadata.');
    });

    it('requires explicit, well-formed Clerk and Merchbase identifiers', () => {
        expect(
            parseProjectionBootstrapOptions([
                '--clerk-subject=user_test_123',
                '--merchbase-user-id=mbu_test_123',
            ])
        ).toEqual({
            clerkSubject: 'user_test_123',
            merchbaseUserId: 'mbu_test_123',
        });
        expect(() =>
            parseProjectionBootstrapOptions([
                '--clerk-subject=user_test_123',
                '--merchbase-user-id=customer@example.com',
            ])
        ).toThrow('Invalid --merchbase-user-id=...');
        expect(() =>
            parseProjectionBootstrapOptions([
                '--clerk-subject=user_test_123',
                '--merchbase-user-id=mbu_test_123',
                '--guess-from-email=true',
            ])
        ).toThrow('Unexpected or duplicate --guess-from-email=...');
    });
});

const createStore = (
    events: AccessProjectionEvent[],
    storedProjection: AccessProjection,
    apply = mock((event: AccessProjectionEvent) => {
        events.push(event);
        return Promise.resolve();
    })
): AccessProjectionStore => ({
    apply,
    findByIdentity: mock(() => {
        const event = events.at(-1);
        return Promise.resolve(
            event?.type === 'remove'
                ? { type: 'tombstone' as const }
                : { projection: storedProjection, type: 'active' as const }
        );
    }),
    findByMerchbaseUserId: mock(() => Promise.resolve(storedProjection)),
});
