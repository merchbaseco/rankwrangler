import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { keywordDirectoryFilters } from '@/api/keyword-directory-input';

// Stage comes from durable target state alone: a keyword whose target is disabled is untracked, a
// trial without enough Merch is dropped, and tracked means it passed or a user asked. Both
// expressions read the `d` (keyword_directory) alias.
export const keywordStageSql = sql`case when d.tracking='dropped' then 'dropped'
    when not d.enabled then 'untracked'
    when d.tracking='trial' then 'trial' else 'graduated' end`;

/**
 * A stage selection restated over the directory columns, so a scan filters on plain columns
 * before computing anything per row. It matches `keywordStageSql` exactly; an empty selection is
 * `true`.
 */
export const keywordStageTargetSql = (stage: string | readonly string[]) => {
    const stages = typeof stage === 'string' ? (stage === 'all' ? [] : [stage]) : stage;
    if (!stages.length) return sql`true`;
    return sql`(${sql.join(
        stages.map(value => stageOverTarget[value as keyof typeof stageOverTarget] ?? sql`false`),
        sql` or `
    )})`;
};

export const keywordDirectoryWhereSql = (
    filters: z.infer<typeof keywordDirectoryFilters>,
    terms?: readonly string[]
) => sql`d.marketplace_id='ATVPDKIKX0DER'
    and ${filters.search ? sql`position(${filters.search.toLowerCase()} in d.term)>0` : sql`true`}
    and ${
        terms
            ? sql`d.term in (${sql.join(
                  terms.map(term => sql`${term}`),
                  sql`,`
              )})`
            : sql`true`
    }
    and ${filters.heat === 'all' ? sql`true` : sql`d.standing_tier=${filters.heat}`}`;

const stageOverTarget = {
    dropped: sql`d.tracking='dropped'`,
    untracked: sql`(not d.enabled and d.tracking<>'dropped')`,
    trial: sql`(d.enabled and d.tracking='trial')`,
    graduated: sql`(d.enabled and d.tracking not in ('dropped','trial'))`,
};
