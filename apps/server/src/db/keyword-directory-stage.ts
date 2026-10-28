import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { keywordDirectoryFilters } from '@/api/keyword-directory-input';

// Stage comes from durable target state alone: a keyword query with no enabled keyword target is
// untracked, a failed trial is dormant (dropped), and tracked means it passed or a user asked.
// Both expressions read the `q` (catalog_queries) and `t` (keyword discovery_targets) aliases.
export const keywordStageSql = sql`case when t.tracking='dormant' then 'dropped'
    when t.id is null or not t.enabled then 'untracked'
    when t.tracking='trial' then 'trial' else 'graduated' end`;

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
