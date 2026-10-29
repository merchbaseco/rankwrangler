import { sql } from 'drizzle-orm';
import { estimateKeepaTokens } from '@/services/providers/keepa/keepa-capacity-policy';
import { db } from './index';
import { readKeepaMeasuredCosts } from './keepa-capacity';
import { keepaCapacityState } from './keepa-capacity-schema';

export const readKeepaCapacitySnapshot = async () => {
    const [state] = await db.select().from(keepaCapacityState);
    const costs = await readKeepaMeasuredCosts();
    const rolling = await db.execute<{
        work_class: string;
        attempts: number;
        actual_tokens: number;
        reserved_unknown_tokens: number;
    }>(sql`
        select work_class, count(*)::integer attempts,
            coalesce(sum(actual_tokens),0)::float8 actual_tokens,
            coalesce(sum(reserved_tokens) filter (where actual_tokens is null),0)::float8 reserved_unknown_tokens
        from keepa_capacity_attempts where reserved_at > timezone('UTC',now())-interval '60 minutes'
        group by work_class
    `);
    const [interest] = await db.execute<{ interactive_waiting: number }>(sql`
        select count(*)::integer interactive_waiting from keepa_capacity_attempts
        where work_class='interactive' and reserved_at is null and settled_at is null
            and created_at > timezone('UTC',now())-interval '60 minutes'
    `);
    return {
        observedAt: state?.observedAt ?? null,
        refillRate: state?.refillRate ?? null,
        estimatedTokensLeft: state ? estimateKeepaTokens(state, new Date()) : null,
        fresh: Boolean(state && Date.now() - state.observedAt.getTime() <= 120_000),
        ...costs,
        liveReserveTokens: state?.liveReserveTokens ?? null,
        interactiveWaiting: interest.interactive_waiting,
        rollingHour: rolling.map(row => ({
            workClass: row.work_class,
            attempts: row.attempts,
            actualTokens: row.actual_tokens,
            reservedUnknownTokens: row.reserved_unknown_tokens,
        })),
    };
};
