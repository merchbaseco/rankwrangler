import { eq } from 'drizzle-orm';
import { db } from './index';
import { automaticSyncControl } from './automatic-sync-schema';
import { eventLogs } from './ops-schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const readAutomaticSync = async (client: Transaction | typeof db = db) => {
    const [state] = await client
        .select()
        .from(automaticSyncControl)
        .where(eq(automaticSyncControl.id, 1));
    return { paused: state?.paused ?? true, updatedAt: state?.updatedAt.toISOString() ?? null };
};
export const isAutomaticSyncPaused = async (tx?: Transaction) => {
    if (!tx) return (await readAutomaticSync()).paused;
    const [state] = await tx
        .select()
        .from(automaticSyncControl)
        .where(eq(automaticSyncControl.id, 1))
        .for('share');
    return state?.paused ?? true;
};

export const setAutomaticSyncPaused = async (paused: boolean, actor: string) =>
    db.transaction(async tx => {
        await tx.insert(automaticSyncControl).values({ id: 1 }).onConflictDoNothing();
        const [current] = await tx
            .select()
            .from(automaticSyncControl)
            .where(eq(automaticSyncControl.id, 1))
            .for('update');
        if (current.paused === paused) return readAutomaticSync(tx);
        const now = new Date();
        await tx
            .update(automaticSyncControl)
            .set({ paused, updatedBy: actor, updatedAt: now })
            .where(eq(automaticSyncControl.id, 1));
        await tx
            .insert(eventLogs)
            .values({
                accountId: 'global',
                occurredAt: now,
                level: 'info',
                status: 'success',
                category: 'keyword',
                action: paused ? 'keyword.sync.paused' : 'keyword.sync.resumed',
                primitiveType: 'keyword',
                primitiveId: 'automatic-sync',
                message: paused ? 'Keyword sync paused' : 'Keyword sync resumed',
                detailsJson: { paused, actor },
            });
        return readAutomaticSync(tx);
    });
