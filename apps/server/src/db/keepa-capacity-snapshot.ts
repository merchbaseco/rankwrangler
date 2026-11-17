import { sql } from 'drizzle-orm';
import { estimateKeepaTokens } from '@/services/providers/keepa/keepa-capacity-policy';
import { db } from './index';
import { measuredKeepaCost } from './keepa-measured-costs';

/**
 * The Keepa allowance for System Status in one statement: the bucket, measured costs, the last
 * hour's spend per work class (a `reserved_at` index range) and open interactive interest.
 */
export const readKeepaCapacitySnapshot = async () => {
    const [row] = await db.execute<{
        tokens_left: number | null;
        refill_rate: number | null;
        refill_in_ms: number | null;
        observed_ms: number | null;
        live_reserve_tokens: number | null;
        product_cost: number | null;
        head_cost: number | null;
        interactive_waiting: number;
        rolling_hour: RollingHourRow[];
    }>(sql`
        select s.tokens_left, s.refill_rate, s.refill_in_ms, s.live_reserve_tokens,
            (extract(epoch from s.observed_at)*1000)::float8 observed_ms,
            ${measuredKeepaCost('product')} product_cost, ${measuredKeepaCost('search')} head_cost,
            (select count(*)::integer from keepa_capacity_attempts
                where work_class='interactive' and reserved_at is null and settled_at is null
                    and created_at>timezone('UTC',now())-interval '60 minutes') interactive_waiting,
            (select coalesce(json_agg(r), '[]'::json) from (
                select work_class "workClass", count(*)::integer attempts,
                    coalesce(sum(actual_tokens),0)::float8 "actualTokens",
                    coalesce(sum(reserved_tokens) filter (where actual_tokens is null),0)::float8
                        "reservedUnknownTokens"
                from keepa_capacity_attempts
                where reserved_at>timezone('UTC',now())-interval '60 minutes'
                group by work_class
            ) r) rolling_hour
        from (select 1) one left join keepa_capacity_state s on s.id=1
    `);
    const state =
        row.observed_ms === null
            ? null
            : {
                  tokensLeft: Number(row.tokens_left),
                  refillRate: Number(row.refill_rate),
                  refillInMs: Number(row.refill_in_ms),
                  observedAt: new Date(row.observed_ms),
              };
    return {
        observedAt: state?.observedAt ?? null,
        refillRate: state?.refillRate ?? null,
        estimatedTokensLeft: state ? estimateKeepaTokens(state, new Date()) : null,
        fresh: Boolean(state && Date.now() - state.observedAt.getTime() <= 120_000),
        productCost: row.product_cost,
        headCost: row.head_cost,
        liveReserveTokens: row.live_reserve_tokens,
        interactiveWaiting: row.interactive_waiting,
        rollingHour: row.rolling_hour,
    };
};

interface RollingHourRow {
    workClass: string;
    attempts: number;
    actualTokens: number;
    reservedUnknownTokens: number;
}
