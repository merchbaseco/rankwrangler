import { type SQL, sql } from 'drizzle-orm';
import type { db } from './index';

// Recent settled calls each operation's cost is measured over. Keepa prices are fixed per request
// kind, so a window answers the same as all history while following a price change within days.
export const KEEPA_MEASURED_COST_WINDOW = 500;
const olderKept = sql.raw(String(KEEPA_MEASURED_COST_WINDOW - 1));

/** The measured per-item cost of `operation` as a scalar subquery: one primary-key row. */
export const measuredKeepaCost = (operation: 'product' | 'search'): SQL =>
    sql`(select cost from keepa_measured_costs where operation=${operation})`;

/**
 * Adds one settled call's per-item cost to its operation's window and recomputes the 95th
 * percentile. Callers hold the capacity lock, so the read-modify-write cannot interleave.
 */
export const recordKeepaMeasuredCost = async (
    tx: Pick<typeof db, 'execute'>,
    { operation, cost, now }: { operation: 'product' | 'search'; cost: number; now: Date }
) => {
    await tx.execute(sql`
        with appended as (
            select coalesce((select recent_costs from keepa_measured_costs where operation=${operation}),
                '{}'::integer[]) || ${cost}::integer costs
        ), kept as (
            select costs[greatest(cardinality(costs)-${olderKept}, 1):] costs
            from appended
        )
        insert into keepa_measured_costs (operation, recent_costs, cost, updated_at)
        select ${operation}, costs,
            (select percentile_disc(0.95) within group (order by c) from unnest(costs) c),
            ${now.toISOString()}::timestamp
        from kept
        on conflict (operation) do update set recent_costs=excluded.recent_costs,
            cost=excluded.cost, updated_at=excluded.updated_at
    `);
};
