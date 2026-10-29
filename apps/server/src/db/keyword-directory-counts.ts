import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { keywordStages, type keywordDirectoryFilters } from '@/api/keyword-directory-input';
import { db } from './index';
import { keywordDirectoryWhereSql, keywordStageSql } from './keyword-directory-stage';

// One grouped pass over queries and targets; it skips the per-row work the directory page needs.
export const countKeywordDirectoryStages = async (
    filters: z.infer<typeof keywordDirectoryFilters>
) => {
    const rows = await db.execute<{ stage: (typeof keywordStages)[number]; count: number }>(sql`
        select ${keywordStageSql} stage,count(*)::int count
        from catalog_queries q
        left join discovery_targets t on t.query_id=q.id and t.kind='keyword'
        where ${keywordDirectoryWhereSql(filters)}
        group by 1`);
    const counts = Object.fromEntries(keywordStages.map(stage => [stage, 0])) as Record<
        (typeof keywordStages)[number],
        number
    >;
    for (const row of rows) {
        counts[row.stage] = row.count;
    }
    return counts;
};
