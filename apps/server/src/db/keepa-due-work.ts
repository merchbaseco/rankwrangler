import { sql } from 'drizzle-orm';
import type { db } from './index';

export const readKeepaDueWork = async (database: Pick<typeof db, 'execute'>) => {
    const [facts] = await database.execute<{
        history_due: boolean;
        head_due: boolean;
        interactive_waiting: boolean;
    }>(sql`
        select
            (exists (select 1 from products where amazon_listing_status='active'
                and history_admission_state='admitted' and is_merch_listing=true
                and root_category_bsr < 1000000 and (keepa_fetched_at is null or
                    keepa_fetched_at <= timezone('UTC',now())-case when root_category_bsr < 300000 then interval '1 day' else interval '7 days' end))
             or exists (select 1 from keepa_capacity_attempts where work_class='history'
                and settled_at is null and created_at > timezone('UTC',now())-interval '60 minutes')) history_due,
            (exists (select 1 from catalog_queries where admitted_at is not null
                and tier not in ('stored','paused') and next_due_at <= timezone('UTC',now()))
             or exists (select 1 from keepa_capacity_attempts where work_class='head'
                and settled_at is null and created_at > timezone('UTC',now())-interval '60 minutes')) head_due,
            exists (select 1 from keepa_capacity_attempts where work_class='interactive'
                and settled_at is null and created_at > timezone('UTC',now())-interval '60 minutes') interactive_waiting
    `);
    return {
        historyDue: facts.history_due,
        headDue: facts.head_due,
        interactiveWaiting: facts.interactive_waiting,
    };
};
