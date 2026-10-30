import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { keywordDirectoryFilters } from '@/api/keyword-directory-input';

// Stage comes from durable target state alone: a keyword query with no enabled keyword target is
// untracked, a trial without enough Merch is dropped, and tracked means it passed or a user asked.
// Both expressions read the `q` (catalog_queries) and `t` (keyword discovery_targets) aliases.
export const keywordStageSql = sql`case when t.tracking='dropped' then 'dropped'
    when t.id is null or not t.enabled then 'untracked'
    when t.tracking='trial' then 'trial' else 'graduated' end`;

/**
 * A stage selection restated over the `t` target alone, so a scan narrows keyword targets before
 * joining every Catalog query. It matches `keywordStageSql` exactly for the stages it covers; a
 * selection that includes `untracked` (no enabled target) or is empty cannot narrow `t` and is
 * `true`.
 */
export const keywordStageTargetSql = (stage: string | readonly string[]) => {
    const stages = typeof stage === 'string' ? (stage === 'all' ? [] : [stage]) : stage;
    if (!stages.length || stages.includes('untracked')) return sql`true`;
    return sql`(${sql.join(
        stages.map(value => stageOverTarget[value as keyof typeof stageOverTarget] ?? sql`false`),
        sql` or `
    )})`;
};

export const keywordDirectoryWhereSql = (
    filters: z.infer<typeof keywordDirectoryFilters>,
    terms?: readonly string[]
) => sql`q.marketplace_id='ATVPDKIKX0DER'
    and ${filters.search ? sql`position(${filters.search.toLowerCase()} in q.normalized_term)>0` : sql`true`}
    and ${
        terms
            ? sql`q.normalized_term in (${sql.join(
                  terms.map(term => sql`${term}`),
                  sql`,`
              )})`
            : sql`true`
    }
    and ${filters.heat === 'all' ? sql`true` : sql`coalesce(t.standing_tier,'unrated')=${filters.heat}`}`;

const stageOverTarget = {
    dropped: sql`t.tracking='dropped'`,
    trial: sql`(t.enabled and t.tracking='trial')`,
    graduated: sql`(t.enabled and t.tracking not in ('dropped','trial'))`,
};
