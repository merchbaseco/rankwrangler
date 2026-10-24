import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { getKeepaCapacitySnapshot } from '@/services/keepa-capacity';
import { getHistoryAdmissionOverloadSnapshot } from '@/services/product-history-overload';

export const getCollectionStatus = async () => {
    const [keepa, overload, history, keywords, passes, attempts] = await Promise.all([
        getKeepaCapacitySnapshot(),
        getHistoryAdmissionOverloadSnapshot(),
        db.execute<{ state: string; products: number; automatic_eligible: number }>(sql`
            select history_admission_state state, count(*)::integer products,
                count(*) filter (where amazon_listing_status='active' and is_merch_listing=true
                    and history_admission_state='admitted' and root_category_bsr < 1000000)::integer automatic_eligible
            from products group by history_admission_state order by history_admission_state
        `),
        db.execute<{
            tier: string;
            keywords: number;
            admitted: number;
            due: number;
            never_observed: number;
        }>(sql`
            select tier, count(*)::integer keywords,
                count(*) filter (where admitted_at is not null)::integer admitted,
                count(*) filter (where admitted_at is not null and tier not in ('stored','paused')
                    and next_due_at <= timezone('UTC',now()))::integer due,
                count(*) filter (where latest_successful_run_at is null)::integer never_observed
            from catalog_queries group by tier order by tier
        `),
        db.execute<{ reason: string; passes: number; ready: number }>(sql`
            select stop_reason reason, count(*)::integer passes,
                count(*) filter (where stop_reason in ('running','budget','jobCap')
                    and resume_at <= timezone('UTC',now()) and (claim_at is null or claim_at < timezone('UTC',now())-interval '5 minutes'))::integer ready
            from keyword_exploration_passes group by stop_reason order by stop_reason
        `),
        db.execute<{ status: string; attempts: number }>(sql`
            select status, count(*)::integer attempts from keyword_discovery_attempts
            where attempted_at > timezone('UTC',now())-interval '24 hours' group by status order by status
        `),
    ]);
    return {
        observedAt: new Date().toISOString(),
        keepa,
        history: {
            admissions: history.map(row => ({
                state: row.state,
                products: row.products,
                automaticEligible: row.automatic_eligible,
            })),
            overload,
        },
        keywords: keywords.map(row => ({
            tier: row.tier,
            keywords: row.keywords,
            admitted: row.admitted,
            due: row.due,
            neverObserved: row.never_observed,
        })),
        exploration: {
            source: 'spapi' as const,
            passes: passes.map(row => ({
                reason: row.reason,
                passes: row.passes,
                ready: row.ready,
            })),
            attempts24h: attempts.map(row => ({ status: row.status, attempts: row.attempts })),
            globalLimit24h: 20,
            keywordLimit24h: 10,
        },
    };
};
