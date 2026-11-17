import { sql } from 'drizzle-orm';
import type { KeepaCapacityOperation } from '@/services/providers/keepa/keepa-capacity-types';
import type { db } from './index';
import { measuredKeepaCost } from './keepa-measured-costs';

const hourAgo = sql`timezone('UTC',now())-interval '60 minutes'`;
const dayAgo = sql`timezone('UTC',now())-interval '24 hours'`;

/**
 * Everything a reservation decides on besides the bucket, in one statement of primary-key and
 * index range reads: measured costs, unsettled spend reserved in the last hour, the day's pilot-cap
 * counts, and whether an interactive attempt opened in the last five minutes is still waiting.
 */
export const readKeepaReservationFacts = async (
    tx: Pick<typeof db, 'execute'>,
    attempt: { operation: KeepaCapacityOperation; keywordId: string | null }
) => {
    const [row] = await tx.execute<{
        product_cost: number | null;
        head_cost: number | null;
        reserved: number;
        heads: number;
        discoveries: number;
        keyword_discoveries: number;
        interactive_operation_attempts: number;
        interactive_waiting: boolean;
    }>(sql`
        select ${measuredKeepaCost('product')} product_cost, ${measuredKeepaCost('search')} head_cost,
            (select coalesce(sum(reserved_tokens),0)::float8 from keepa_capacity_attempts
                where reserved_at>${hourAgo} and actual_tokens is null) reserved,
            (select count(*)::integer from keepa_capacity_attempts
                where work_class='head' and reserved_at>${dayAgo}) heads,
            (select count(*)::integer from keepa_capacity_attempts
                where work_class='discovery' and reserved_at>${dayAgo}) discoveries,
            (select count(*)::integer from keepa_capacity_attempts
                where work_class='discovery' and reserved_at>${dayAgo}
                    and keyword_id=${attempt.keywordId}) keyword_discoveries,
            (select count(*)::integer from keepa_capacity_attempts
                where work_class='interactive' and reserved_at>${dayAgo}
                    and operation=${attempt.operation}) interactive_operation_attempts,
            exists (select 1 from keepa_capacity_attempts where work_class='interactive'
                and settled_at is null
                and created_at>timezone('UTC',now())-interval '5 minutes') interactive_waiting
    `);
    return {
        productCost: row.product_cost,
        headCost: row.head_cost,
        reservedCost: row.reserved,
        headRequests: row.heads,
        discoveryRequests: row.discoveries,
        keywordDiscoveryRequests: row.keyword_discoveries,
        interactiveOperationAttempts: row.interactive_operation_attempts,
        interactiveWaiting: row.interactive_waiting,
    };
};
