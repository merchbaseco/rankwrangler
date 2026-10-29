import { sql } from 'drizzle-orm';
import type { db } from './index';

// An open interactive attempt from the last five minutes means someone is waiting on Keepa.
export const isKeepaInteractiveWaiting = async (database: Pick<typeof db, 'execute'>) => {
    const [facts] = await database.execute<{ interactive_waiting: boolean }>(sql`
        select exists (select 1 from keepa_capacity_attempts where work_class='interactive'
            and settled_at is null and created_at > timezone('UTC',now())-interval '5 minutes')
            interactive_waiting
    `);
    return facts.interactive_waiting;
};
