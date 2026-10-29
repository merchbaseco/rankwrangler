import { sql } from 'drizzle-orm';
import type { db } from './index';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const notifyEventLogCreated = async (tx: Transaction, accountIds: readonly string[]) => {
    for (const accountId of new Set(accountIds))
        await tx.execute(
            sql`select pg_notify('event_log_created', ${JSON.stringify({ accountId })})`
        );
};
