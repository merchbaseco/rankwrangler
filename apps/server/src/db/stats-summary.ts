import { sql } from 'drizzle-orm';
import { db } from './index';

/**
 * Footer totals for any signed-in user. Keyword counts cover enabled keyword targets: tracked
 * means graduated, mined means at least one accepted discovery page in the last 24 hours, and
 * queued means due now or never observed. These are approximations of the directory's derived
 * status, not a second copy of it.
 */
export const readStatsSummary = async (now = new Date()) => {
    const at = now.toISOString();
    const [row] = await db.execute<StatsSummary>(sql`
        select
            (select count(*) from products)::int "totalProducts",
            (select count(*) from products where is_merch_listing=true)::int "totalMerchProducts",
            (select count(*) from discovery_targets
                where kind='keyword' and tracking='tracked' and enabled)::int "keywordsTracked",
            (select count(distinct p.target_id) from keyword_discovery_attempts a
                join keyword_exploration_passes p on p.id=a.pass_id
                join discovery_targets t on t.id=p.target_id and t.kind='keyword'
                where a.status='accepted' and a.attempted_at>=${at}::timestamp-interval '24 hours'
                    and a.finished_at>=${at}::timestamp-interval '24 hours')::int "keywordsMinedLastDay",
            (select count(*) from discovery_targets
                where kind='keyword' and enabled and tracking<>'dormant'
                    and (head_observed_at is null or next_check_at<=${at}::timestamp))::int "keywordsQueued"`);
    return row;
};

interface StatsSummary extends Record<string, unknown> {
    totalProducts: number;
    totalMerchProducts: number;
    keywordsTracked: number;
    keywordsMinedLastDay: number;
    keywordsQueued: number;
}
