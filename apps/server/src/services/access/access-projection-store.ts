import type {
    AccessProjection,
    AccessProjectionEvent,
    AccessProjectionStore,
    ClerkIdentity,
} from '@merchbaseco/access';
import { and, desc, eq, sql } from 'drizzle-orm';
import { accessProjection, accessProjectionEvents } from '@/db/access-schema';
import { type Database, db } from '@/db/index';

export const createRankWranglerAccessProjectionStore = (
    database: Database = db
): AccessProjectionStore => ({
    apply: event => applyProjectionEvent(database, event),
    findByIdentity: identity => findByIdentity(database, identity),
    findByMerchbaseUserId: merchbaseUserId => findByMerchbaseUserId(database, merchbaseUserId),
});

const applyProjectionEvent = async (database: Database, event: AccessProjectionEvent) => {
    const identity = event.type === 'upsert' ? event.projection : event.identity;
    const sourceUpdatedAt =
        event.type === 'upsert' ? event.projection.sourceUpdatedAt : event.sourceUpdatedAt;

    await database.transaction(async transaction => {
        const accepted = await transaction
            .insert(accessProjectionEvents)
            .values({
                eventId: event.eventId,
                issuer: identity.issuer,
                subject: identity.subject,
                sourceUpdatedAt,
            })
            .onConflictDoNothing({ target: accessProjectionEvents.eventId })
            .returning({ eventId: accessProjectionEvents.eventId });

        if (!accepted[0]) {
            return;
        }

        const projection = event.type === 'upsert' ? event.projection : null;
        await transaction
            .insert(accessProjection)
            .values({
                issuer: identity.issuer,
                subject: identity.subject,
                state: projection ? 'active' : 'tombstone',
                merchbaseUserId: projection?.merchbaseUserId ?? null,
                access: projection?.access ?? null,
                accessValidUntil: projection?.accessValidUntil ?? null,
                sourceUpdatedAt,
                lastEventId: event.eventId,
            })
            .onConflictDoUpdate({
                target: [accessProjection.issuer, accessProjection.subject],
                set: {
                    state: projection ? 'active' : 'tombstone',
                    merchbaseUserId: projection?.merchbaseUserId ?? null,
                    access: projection?.access ?? null,
                    accessValidUntil: projection?.accessValidUntil ?? null,
                    sourceUpdatedAt,
                    lastEventId: event.eventId,
                    updatedAt: new Date(),
                },
                where: sql`${accessProjection.sourceUpdatedAt} <= excluded.source_updated_at`,
            });
    });
};

const findByIdentity = async (database: Database, identity: ClerkIdentity) => {
    const rows = await database
        .select()
        .from(accessProjection)
        .where(
            and(
                eq(accessProjection.issuer, identity.issuer),
                eq(accessProjection.subject, identity.subject)
            )
        )
        .limit(1);
    const row = rows[0];

    if (!row) {
        return { type: 'missing' as const };
    }
    if (row.state === 'tombstone') {
        return { type: 'tombstone' as const };
    }

    return {
        type: 'active' as const,
        projection: toProjection(row),
    };
};

const findByMerchbaseUserId = async (
    database: Database,
    merchbaseUserId: string
): Promise<AccessProjection | null> => {
    const rows = await database
        .select()
        .from(accessProjection)
        .where(
            and(
                eq(accessProjection.state, 'active'),
                eq(accessProjection.merchbaseUserId, merchbaseUserId)
            )
        )
        .orderBy(
            desc(accessProjection.sourceUpdatedAt),
            desc(accessProjection.issuer),
            desc(accessProjection.subject)
        )
        .limit(1);

    return rows[0] ? toProjection(rows[0]) : null;
};

const toProjection = (row: typeof accessProjection.$inferSelect): AccessProjection => {
    if (!(row.merchbaseUserId && isAccessState(row.access))) {
        throw new Error('Active access projection is missing required values.');
    }

    return {
        access: row.access,
        accessValidUntil: row.accessValidUntil,
        issuer: row.issuer,
        merchbaseUserId: row.merchbaseUserId,
        sourceUpdatedAt: row.sourceUpdatedAt,
        subject: row.subject,
    };
};

const isAccessState = (value: string | null): value is 'granted' | 'not_granted' =>
    value === 'granted' || value === 'not_granted';
