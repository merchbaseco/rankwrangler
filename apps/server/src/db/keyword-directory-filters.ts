import { type SQL, sql } from 'drizzle-orm';
import type { KeywordDirectoryReadInput } from '@/api/keyword-directory-input';

type FilterInput = Pick<
    KeywordDirectoryReadInput,
    'search' | 'heat' | 'stage' | 'freshness' | 'facet'
> &
    Partial<Pick<KeywordDirectoryReadInput, 'shelfElite' | 'merch'>>;

/**
 * The directory's row predicates over `ordered`, one per sidebar group so the facet aggregate can
 * count a group without its own filter. Each is `true` when unset. The public input sends one
 * value per group (`all` or a value); the dashboard sends a union (empty means any).
 */
export const directoryFilters = (input: FilterInput) =>
    ({
        search: input.search ? sql`position(${input.search.toLowerCase()} in term)>0` : sql`true`,
        stage: anyOf('stage', input.stage),
        freshness: anyOf('freshness', input.freshness),
        heat: anyOf('heat', input.heat),
        facet: input.facet ? sql`facet=${input.facet}` : sql`true`,
        shelfElite:
            input.shelfElite === 'has'
                ? sql`elite>0`
                : input.shelfElite === 'none'
                  ? sql`elite=0`
                  : sql`true`,
        merch:
            input.merch === 'tracked'
                ? sql`merch>0`
                : input.merch === 'none'
                  ? sql`merch=0`
                  : sql`true`,
    }) satisfies Record<string, SQL>;

export type DirectoryFilters = ReturnType<typeof directoryFilters>;

/** Every predicate except the named groups, joined with `and`. */
export const directoryWhere = (
    filters: DirectoryFilters,
    except: readonly (keyof DirectoryFilters)[] = []
) =>
    sql.join(
        (Object.keys(filters) as (keyof DirectoryFilters)[])
            .filter(key => !except.includes(key))
            .map(key => sql`(${filters[key]})`),
        sql` and `
    );

const anyOf = (column: 'stage' | 'freshness' | 'heat', value: string | readonly string[]) => {
    const values = typeof value === 'string' ? (value === 'all' ? [] : [value]) : value;
    return values.length
        ? sql`${sql.identifier(column)} in (${sql.join(
              values.map(item => sql`${item}`),
              sql`,`
          )})`
        : sql`true`;
};
