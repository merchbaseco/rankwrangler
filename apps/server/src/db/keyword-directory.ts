import { sql } from 'drizzle-orm';
import type {
    AppKeywordDirectoryInput,
    KeywordDirectoryReadInput,
    KeywordDirectoryView,
    keywordFreshness,
    keywordStages,
} from '@/api/keyword-directory-input';
import { db } from './index';
import { directoryFilters, directoryWhere, measuredStages } from './keyword-directory-filters';
import { directoryProductCounts } from './keyword-directory-sort';
import { directorySource } from './keyword-directory-source';

type DirectoryRow = {
    sortKey: NonNullable<AppKeywordDirectoryInput['cursor']>['key'];
    id: string;
    queryId: string;
    term: string;
    createdAt: string;
    stage: (typeof keywordStages)[number];
    freshness: (typeof keywordFreshness)[number] | null;
    retryScheduled: boolean;
    heat: string;
    score: number | null;
    searchFrequencyRank: number | null;
    sources: string[];
    products: number;
    merch: number;
    lastCheckedAt: string | null;
    nextCheckAt: string | null;
    intervalDays: number | null;
    total: number;
};

/**
 * One directory page with the total under the request's filters. `page` reads by offset and
 * ignores the cursor; otherwise keyset paging continues from `cursor`. Reading specific `terms`
 * ignores the stage, freshness and sidebar filters so callers can re-evaluate a row.
 */
export const readKeywordDirectory = async (
    input: KeywordDirectoryReadInput,
    options?: { terms?: readonly string[]; view?: KeywordDirectoryView }
) => {
    const asOf = options?.view?.asOf ?? input.cursor?.asOf ?? new Date().toISOString();
    const sort = options?.view?.sort ?? input.cursor?.sort ?? input.sort;
    const terms = options?.terms;
    const size = terms ? terms.length : (input.pageSize ?? input.limit);
    const filters = directoryFilters(input);
    const cursor = !terms && input.cursor && !input.page ? input.cursor : undefined;
    // Measures feed the order or the filter only for these; otherwise the page alone is measured.
    const measuresFirst =
        sort === 'merch' ||
        sort === 'medianBsr' ||
        sort === 'fresh' ||
        input.merch !== undefined ||
        input.shelfElite !== undefined ||
        input.facet !== undefined;
    const source = directorySource({
        asOf,
        sort,
        search: input.search,
        terms,
        facet: input.facet,
        shelf: input.shelfElite !== undefined,
        measured: measuresFirst ? (terms ? sql`true` : measuredStages(input.stage)) : null,
        stage: terms ? undefined : input.stage,
    });
    const where = terms ? sql`true` : directoryWhere(filters, ['search']);
    const rows = await db.execute<DirectoryRow>(sql`
        ${source}
        select page.*,coalesce(s.sources,'{}'::text[]) sources${measuresFirst ? sql`` : sql`,m.products,m.merch`} from (
            select id,"queryId",term,"createdAt",stage,freshness,"retryScheduled",heat,score,"searchFrequencyRank",${measuresFirst ? sql`products,merch,` : sql``}"lastCheckedAt","sortKey",total,
                case when freshness is null then null else "nextCheckAt" end "nextCheckAt",
                case when freshness is null then null else "intervalDays" end "intervalDays"
            from (select *,count(*) over()::int total from ordered where ${where}) matched
            where ${cursor ? sql`"sortKey">${JSON.stringify(cursor.key)}::jsonb` : sql`true`}
            order by "sortKey" asc limit ${size + 1} offset ${!terms && input.page ? (input.page - 1) * size : 0}
        ) page
        ${measuresFirst ? sql`` : sql`left join lateral (${directoryProductCounts(sql`page."queryId"`)}) m on true`}
        left join lateral (select array_agg(distinct e.kind) sources from discovery_targets t
            join discovery_evidence e on e.target_id=t.id and e.eligible
            where t.query_id=page."queryId" and t.kind='keyword') s on true
        order by page."sortKey" asc`);
    const items = rows.slice(0, size).map(({ total: _total, ...row }) => ({
        ...row,
        createdAt: utcTimestamp(row.createdAt)!,
        lastCheckedAt: utcTimestamp(row.lastCheckedAt),
        nextCheckAt: utcTimestamp(row.nextCheckAt),
    }));
    const last = items.at(-1);
    const view: KeywordDirectoryView = { asOf, sort };
    return {
        items,
        // A page past the end carries no window total, so only then is it counted on its own.
        total:
            rows[0]?.total ??
            (cursor || (input.page ?? 1) > 1
                ? ((
                      await db.execute<{ total: number }>(
                          sql`${source} select count(*)::int total from ordered where ${where}`
                      )
                  )[0]?.total ?? 0)
                : 0),
        view,
        nextCursor: !terms && rows.length > size && last ? { key: last.sortKey, ...view } : null,
    };
};

export const listKeywordDirectory = async (
    input: KeywordDirectoryReadInput,
    options?: { terms?: readonly string[] }
) => {
    const result = await readKeywordDirectory(input, options);
    return { items: result.items.map(({ sortKey, ...row }) => row), nextCursor: result.nextCursor };
};

const utcTimestamp = (value: string | null) =>
    value === null ? null : new Date(`${value.replace(' ', 'T')}Z`).toISOString();
