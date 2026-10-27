import { eq, sql } from 'drizzle-orm';
import { catalogCapacityBalance } from '@/services/catalog-capacity-policy';
import { scanBackpressure } from '@/services/keyword-scan-backpressure';
import { db } from './index';
import { spApiCatalogCapacity } from './spapi-capacity-schema';

// Estimated SP-API scan work still ahead, and whether the producers that create more of it (Ads
// mining, autocomplete) should admit new sources.
export const readScanBacklog = async (now = new Date()) => {
    const [[capacity], [backlog]] = await Promise.all([
        db.select().from(spApiCatalogCapacity).where(eq(spApiCatalogCapacity.id, 1)),
        db.execute<{ pages: number; heads: number; oldest_due_head_at: Date | null }>(sql`
            select coalesce(sum(case
                    when p.id is not null and p.next_page>0 then greatest(1,${initialPages}-p.next_page)
                    when t.head_observed_at is null then ${initialPages}
                    when coalesce(t.next_check_at,${now.toISOString()}::timestamp)<=${now.toISOString()}::timestamp then 1
                    else 0 end),0)::int pages,
                count(*) filter (where (p.id is null or p.next_page=0) and (t.head_observed_at is null
                    or coalesce(t.next_check_at,${now.toISOString()}::timestamp)<=${now.toISOString()}::timestamp))::int heads,
                min(coalesce(t.next_check_at,t.created_at)) filter (where (p.id is null or p.next_page=0)
                    and (t.head_observed_at is null
                    or coalesce(t.next_check_at,${now.toISOString()}::timestamp)<=${now.toISOString()}::timestamp))
                    oldest_due_head_at
            from discovery_targets t left join keyword_exploration_passes p on p.target_id=t.id
                and p.stop_reason in ('running','budget','jobCap')
            where t.enabled`),
    ]);
    // Before the first Catalog call there is no capacity row; assume the default 0.5/s ceiling.
    const backgroundRps = capacity ? catalogCapacityBalance(capacity, now).backgroundRps : 0.5;
    return {
        dueHeads: backlog?.heads ?? 0,
        oldestDueHeadAt: backlog?.oldest_due_head_at ?? null,
        ...scanBackpressure({ queuedPages: backlog?.pages ?? 0, backgroundRps }),
    };
};

// Planning allowance for a keyword without a first head: one head plus initial depth. Real passes
// stop earlier at source end or low yield.
const initialPages = 5;
